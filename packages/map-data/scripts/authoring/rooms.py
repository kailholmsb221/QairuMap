"""
The room programme of building A, keyed to the two plan renders.

`docs/BUILDING.md` is the authority for the codes, names, types, wings,
capacities and schedulable flags below; this file adds the one thing the table
cannot carry - **where on the plan each space is**. A room is named by one or
more `anchors`, points in `reference/floor-{n}.png` pixel coordinates that fall
inside the cell(s) the tracer segments for it. Several anchors mean the plan
draws the space in more than one piece (a room with a stub partition through it,
say) and the pieces are merged.

The spaces the plan draws with no fill of their own cannot be segmented;
`SHAPES` gives those the polygon the plan does draw for them, in the same frame.
"""

# code: (name EN, type, wing, capacity or None, schedulable)
PROGRAMME = {
    1: {
        '100':      ('Assembly Hall',          'lecture',   'south', 180,  True),
        '101':      ('Teaching Laboratory',    'lab',       'south', 30,   True),
        '102':      ('Library',                'coworking', 'south', 60,   False),
        '102A':     ('Library — Reading Room', 'coworking', 'south', 40, False),
        '103':      ('Medical Room',           'service',   'south', 4,    False),
        'CR':       ('Conference Room',        'seminar',   'south', 24,   True),
        'CINEMA':   ('Cinema',                 'lecture',   'south', 60,   False),
        'WC-1':     ('Restrooms',              'service',   'south', None, False),
        'WC-2':     ('Restrooms',              'service',   'south', None, False),
        'CAFE':     ('Cafe',                   'service',   'core',  120,  False),
        'ATRIUM-N': ('North Atrium',           'service',   'north', None, False),
        'TECH-N2':  ('Technical',              'service',   'north', None, False),
        'TECH-N3':  ('Technical',              'service',   'north', None, False),
        'TECH-S1':  ('Technical',              'service',   'south', None, False),
    },
    2: {
        '200':    ('Lecture Hall',                        'lecture',   'north', 120,  True),
        '201':    ('Conference Hall',                     'seminar',   'north', 40,   True),
        '202':    ("Dean's Office",                  'admin',     'north', 10,   False),
        '203':    ('Department of Academic Activities',   'admin',     'north', 12,   False),
        '204':    ('Teaching Laboratory',                 'lab',       'core',  25,   True),
        '205':    ('Warehouse',                           'service',   'core',  None, False),
        '206':    ("Rector's Reception Office",      'admin',     'north', 6,    False),
        '207':    ('Rector Sapar Toksanov',               'admin',     'north', 8,    False),
        '208':    ('First Vice-Rector Serik Omirbayev',   'admin',     'north', 8,    False),
        '209':    ("Vice-Rectors' Reception",        'admin',     'north', 6,    False),
        '210':    ('Office 210',                          'admin',     'north', 6,    False),
        '211':    ('Office 211',                          'admin',     'north', 6,    False),
        '212':    ('Office 212',                          'admin',     'north', 6,    False),
        '213':    ('Advisor to the Rector Aidyn Sabitov', 'admin',     'north', 4,    False),
        '214':    ('Accounting Department',               'admin',     'north', 12,   False),
        '215':    ('Office 215',                          'admin',     'north', 8,    False),
        'AI-LAB': ('AI Lab',                              'lab',       'core',  25,   True),
        '217':    ('Dept. of Marketing and PR',           'admin',     'south', 12,   False),
        '218':    ('School of Educational Programs',      'admin',     'south', 14,   False),
        '219':    ('Lecture Hall',                        'lecture',   'south', 100,  True),
        '220':    ('Staff Room',                          'service',   'south', 8,    False),
        '221':    ("Registrar's Office",             'admin',     'south', 10,   False),
        '222':    ('Computer Lab',                        'lab',       'south', 25,   True),
        '223':    ('Teaching Laboratory',                 'lab',       'core',  25,   True),
        '224':    ('Lecture Hall',                        'lecture',   'south', 100,  True),
        '225':    ('Staff Room',                          'service',   'south', 6,    False),
        '226':    ('Teaching Laboratory',                 'lab',       'core',  30,   True),
        '226A':   ('Teaching Laboratory',                 'lab',       'core',  25,   True),
        '227':    ('IT Department',                       'admin',     'south', 15,   False),
        '228':    ('Coworking',                           'coworking', 'north', 30,   False),
        '229':    ('Staff Room',                          'service',   'south', None, False),
        '231':    ('Storage Room',                        'service',   'north', None, False),
        '232':    ('Staff Room',                          'service',   'south', None, False),
        'WC-N2':  ('Restrooms',                           'service',   'core',  None, False),
        'WC-S2':  ('Restrooms',                           'service',   'core',  None, False),
    },
}

# code: [(x, y), ...] in reference/floor-{n}.png pixels
ANCHORS = {
    1: {
        'ATRIUM-N': [(1283, 258)],
        'TECH-N2':  [(1012, 778)],
        'TECH-N3':  [(1572, 1084)],
        'TECH-S1':  [(1558, 1545)],
        '100':      [(507, 1488), (449, 1716)],
        '101':      [(653, 2071)],
        '102':      [(885, 2217)],
        '102A':     [(1220, 2393), (1043, 2126)],
        '103':      [(1429, 2217), (1430, 1897), (1416, 2027)],
        'CR':       [(793, 1560)],
        'CINEMA':   [(770, 1732)],
        'WC-1':     [(1037, 1570)],
        'WC-2':     [(1001, 1803)],
        'CORE-N':   [(1601, 1337)],
        'CORE-S':   [(1486, 1787)],
    },
    2: {
        '200':    [(1222, 1136)],
        '201':    [(1019, 1185)],
        '202':    [(833, 1065)],
        '203':    [(978, 929)],
        '204':    [(1129, 753)],
        '205':    [(1293, 724)],
        '206':    [(898, 770)],
        '207':    [(890, 857)],
        '208':    [(796, 784)],
        '209':    [(859, 602)],
        '210':    [(882, 682)],
        '211':    [(747, 685)],
        '212':    [(753, 573)],
        '213':    [(847, 519)],
        '214':    [(1054, 505)],
        '215':    [(1222, 487)],
        'AI-LAB': [(1489, 456)],
        '217':    [(1708, 478)],
        '218':    [(1888, 494)],
        '219':    [(2152, 534)],
        '220':    [(2229, 723), (2101, 637), (2242, 640)],
        '221':    [(2097, 776), (2197, 869)],
        '222':    [(2091, 976)],
        '223':    [(1794, 925)],
        '224':    [(1778, 1150)],
        '225':    [(1654, 1069)],
        '226':    [(1464, 1175)],
        '226A':   [(1211, 915)],
        '227':    [(1801, 647)],
        '228':    [(1024, 668)],
        '229':    [(1965, 1186)],
        '231':    [(1204, 647)],
        '232':    [(1660, 633)],
        'WC-N2':  [(1655, 723)],
        'WC-S2':  [(1805, 739)],
        'VOID':   [(1474, 892)],
        'CORE-N': [(1742, 582)],
        'CORE-S': [(1882, 784)],
    },
}

# Spaces the plan draws with no fill of their own, as the polygon it does draw.
SHAPES = {
    1: {
        # the rounded tag the plan prints "cafe" inside, in the middle of the lobby
        'CAFE': [(952, 1230), (1071, 1224), (1074, 1364), (955, 1371)],
    },
    2: {},
}

CORE_NAMES = {'CORE-N': 'Stairs & Lifts', 'CORE-S': 'Stairs'}
