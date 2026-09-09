"""
Shared helpers for the floor-plan tracer.

`reference/floor-{1,2}.png` are the two real plan renders. Everything the map
draws is segmented out of them here; nothing is laid out by hand except the five
spaces the plan draws with no fill of their own (see `rooms.py`).

    thin    the Scharr ridge of the luminance, with the white room captions
            painted out first so a number never bites a notch out of its room
            nor erases the wall it happens to sit on
    sealed  the same walls with the doorway gaps the plan draws closed by
            oriented line closings — a gap in a straight wall is collinear, so it
            seals while a room never fills in
    seeds   components of (plate & !sealed): one per room, but with corners
            rounded off wherever the sealing reached into them
    cells   every component of (plate & !thin) — the true, crisp room shape —
            handed to the seed inside it. A component holding several seeds
            (rooms joined through a doorway) is split between them by nearest
            seed, and the wall band itself goes to the nearest cell, so two
            neighbours meet on the centre line of the wall between them.
"""
from __future__ import annotations

import numpy as np
import cv2
from PIL import Image
from scipy import ndimage as ndi

GRAD_T = 80.0           # luminance gradient that counts as a wall
DOOR = 31               # longest doorway gap the line closings seal, in source px
CAPTION_LUM = 232.0     # a room number is whiter than any fill on either plan


def load(ref_dir: str, n: int):
    """The plate of floor `n`: its filled silhouette and the raw RGB."""
    a = np.array(Image.open(f'{ref_dir}/floor-{n}.png').convert('RGBA'))
    rgb = a[..., :3].astype(np.float32)
    # floor 1 is cut out against transparency, floor 2 against white
    plate = (a[..., 3] > 60) if n == 1 else ~((a[..., 0] > 246) & (a[..., 1] > 246) & (a[..., 2] > 246))
    h, w = plate.shape
    ff = (~plate).astype(np.uint8) * 255
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 128)
    solid = ~(ff == 128)
    solid = cv2.morphologyEx(solid.astype(np.uint8), cv2.MORPH_CLOSE,
                             cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))).astype(bool)
    return ndi.binary_fill_holes(solid), rgb


def _line(length: int, deg: float) -> np.ndarray:
    m = np.zeros((length, length), np.uint8)
    c = length // 2
    t = np.deg2rad(deg)
    for i in range(-c, c + 1):
        x = int(round(c + i * np.cos(t)))
        y = int(round(c + i * np.sin(t)))
        if 0 <= x < length and 0 <= y < length:
            m[y, x] = 1
    return m


def seal_doorways(wall: np.ndarray, length: int = DOOR, step: int = 15) -> np.ndarray:
    out = wall.astype(bool).copy()
    for d in range(0, 180, step):
        out |= cv2.morphologyEx(wall, cv2.MORPH_CLOSE, _line(length, d)).astype(bool)
    return out


def masks(rgb: np.ndarray, solid: np.ndarray, door: int = DOOR, blue: float = 12.0):
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    med = cv2.medianBlur(np.clip(rgb, 0, 255).astype(np.uint8), 31).astype(np.float32)
    coloured = ((med[..., 2] - med[..., 0]) > blue) & solid          # captions blurred away
    caption = cv2.dilate(((lum > CAPTION_LUM) & coloured).astype(np.uint8), np.ones((9, 9), np.uint8))
    flat = cv2.inpaint(np.clip(rgb, 0, 255).astype(np.uint8)[..., ::-1], caption, 9, cv2.INPAINT_TELEA)
    fl = cv2.cvtColor(flat, cv2.COLOR_BGR2GRAY).astype(np.float32)
    g = np.hypot(cv2.Scharr(fl, cv2.CV_32F, 1, 0), cv2.Scharr(fl, cv2.CV_32F, 0, 1))
    w = cv2.morphologyEx((g > GRAD_T).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    thin = cv2.dilate(w, np.ones((3, 3), np.uint8)).astype(bool) & solid
    return thin, seal_doorways(thin.astype(np.uint8), door), coloured


def _nearest(labels: np.ndarray, where: np.ndarray) -> np.ndarray:
    _, idx = ndi.distance_transform_edt(labels == 0, return_indices=True)
    out = labels.copy()
    out[where] = labels[tuple(idx)][where]
    return out


def cells(ref_dir: str, n: int, min_seed: int, door: int = DOOR, min_cell: int = 0):
    """The per-pixel cell map of floor `n`, plus its silhouette."""
    solid, rgb = load(ref_dir, n)
    thin, sealed, coloured = masks(rgb, solid, door)

    lab, k = ndi.label(solid & ~sealed)
    area = np.bincount(lab.ravel(), minlength=k + 1)
    area[0] = 0
    keep = np.where(area >= min_seed)[0]
    remap = np.zeros(k + 1, np.int32)
    for j, i in enumerate(keep, 1):
        remap[i] = j
    seeds = remap[lab]
    for j in range(1, len(keep) + 1):                       # heal caption holes
        m = ndi.binary_fill_holes(seeds == j)
        seeds[m & (seeds == 0)] = j

    # The crisp cells are the rooms. The seeds only say which of them a doorway
    # joins — a cell the sealing swallowed whole keeps its own shape and becomes
    # a cell of its own, which is how the small partitioned rooms survive.
    fl, fk = ndi.label(solid & ~thin)
    out = np.zeros_like(seeds)
    nxt = len(keep)
    sizes = np.bincount(fl.ravel(), minlength=fk + 1)
    for c in range(1, fk + 1):
        m = fl == c
        ids = np.unique(seeds[m])
        ids = ids[ids > 0]
        if len(ids) == 1:
            out[m] = ids[0]
        elif len(ids) > 1:                                  # joined through a doorway
            sub = np.where(m, seeds, 0)
            out[m] = _nearest(sub, m & (sub == 0))[m]
        elif sizes[c] >= min_cell:
            nxt += 1
            out[m] = nxt
    out = _nearest(out, solid & (out == 0))                 # split the wall band
    out[~solid] = 0
    return dict(labels=out, solid=solid, rgb=rgb, coloured=coloured, count=nxt)


def contour_of(mask: np.ndarray, smooth: int = 0) -> np.ndarray:
    """The outer ring of the largest island of `mask`, as an (N, 2) float array.

    `smooth` opens and closes the mask first, which files off the saw teeth a
    caption leaves along an edge it was painted out of without moving a wall.
    """
    m = mask.astype(np.uint8)
    if smooth:
        se = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (smooth, smooth))
        m = cv2.morphologyEx(cv2.morphologyEx(m, cv2.MORPH_OPEN, se), cv2.MORPH_CLOSE, se)
        if m.sum() == 0:
            m = mask.astype(np.uint8)
    lab, k = ndi.label(m)
    if k > 1:
        sizes = np.bincount(lab.ravel())
        sizes[0] = 0
        m = (lab == sizes.argmax()).astype(np.uint8)
    cn, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    if not cn:
        return np.zeros((0, 2))
    big = max(cn, key=cv2.contourArea)
    return big.reshape(-1, 2).astype(np.float64)
