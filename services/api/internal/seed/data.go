package seed

import (
	"strconv"

	"github.com/google/uuid"

	"github.com/kailholmes/campuslive/services/api/internal/domain"
)

// ID derives a deterministic UUID v5 the same way packages/map-data does, so
// the web app, the database and the fixtures agree on identity without ever
// storing a mapping. Room ids come straight out of building-a.json and use the
// very same scheme (`campuslive:room:{code}`).
func ID(kind, key string) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceDNS, []byte("campuslive:"+kind+":"+key))
}

// BuildingName is what `buildings.name` holds — deliberately neutral, because
// the floor plans do not name the institution. Change this one constant (and
// BUILDING_NAME in packages/map-data/scripts/svg2map.ts) to the university's
// own name.
const BuildingName = "Главный учебный корпус"

// SemesterName is the current term.
const SemesterName = "Осенний семестр 2026"

// TeacherCount and GroupCount are the placeholder rosters. Both are renamed
// from the admin panel; nothing in the code depends on their text
// (docs/BUILDING.md § Schedule).
const (
	TeacherCount = 12
	GroupCount   = 24
)

// roomNames maps a room code to the Kazakh/Russian display name of
// docs/BUILDING.md. `rooms.name` holds this; the English name stays in the map
// data as `data-name`, so both are available.
//
// It is only ever read by key — never ranged over — so generation stays
// deterministic.
var roomNames = map[string]string{
	// ---- floor 1 ----
	"100":      "Мәжіліс залы",
	"101":      "Оқу зертханасы",
	"102":      "Кітапхана",
	"102A":     "Кітапхана — оқу залы",
	"103":      "Медициналық пункт",
	"CR":       "Конференц-бөлме (CR)",
	"CINEMA":   "Кинозал",
	"WC-1":     "Дәретхана",
	"WC-2":     "Дәретхана",
	"CAFE":     "Асхана",
	"ATRIUM-N": "Солтүстік атриум",
	"CORE-N1":  "Баспалдақ және лифт",
	"CORE-S1":  "Баспалдақ",

	// ---- floor 2 ----
	"200":     "Дәріс аудиториясы",
	"201":     "Кеңес өткізу залы",
	"202":     "Деканат",
	"203":     "Академиялық қызмет департаменті",
	"204":     "Оқу зертханасы",
	"205":     "Қойма бөлмесі",
	"206":     "Ректордың қабылдау бөлмесі",
	"207":     "Ректор Тоқсанов Сапар Нұрахметұлы",
	"208":     "Бірінші проректор Өмірбаев Серік Мәуленұлы",
	"209":     "Проректорлардың қабылдау бөлмесі",
	"210":     "Кабинет 210",
	"211":     "Кабинет 211",
	"212":     "Кабинет 212",
	"213":     "Ректор кеңесшісі Сабитов Айдын Маратұлы",
	"214":     "Бухгалтерлік есеп департаменті",
	"215":     "Кабинет 215",
	"AI-LAB":  "AI зертханасы",
	"217":     "Маркетинг және қоғаммен байланыс департаменті",
	"218":     "Білім беру бағдарламалары мектебі",
	"219":     "Дәріс аудиториясы",
	"220":     "Қызметтік бөлме",
	"221":     "Тіркеу кеңсесі",
	"222":     "Компьютерлік сынып",
	"223":     "Оқу зертханасы",
	"224":     "Дәріс аудиториясы",
	"225":     "Қызметтік бөлме",
	"226":     "Оқу зертханасы",
	"226A":    "Оқу зертханасы",
	"WC-N2":   "Дәретхана",
	"WC-S2":   "Дәретхана",
	"VOID-2":  "Атриум ойығы",
	"CORE-N2": "Баспалдақ және лифт",
	"CORE-S2": "Баспалдақ",
	"227":     "IT департаменті",
	"228":     "Коворкинг",
	"229":     "Қызметтік бөлме",
	"231":     "Қойма бөлмесі",
	"232":     "Қызметтік бөлме",
}

// RoomName is the Kazakh/Russian display name of a room code, falling back to
// the English name carried by the map data.
func RoomName(code, fallback string) string {
	if name, ok := roomNames[code]; ok {
		return name
	}
	return fallback
}

// roomAliases are the everyday words a visitor actually types. `rooms.name` is
// the university's own Kazakh wording, so without these «кафе», «туалет»,
// «столовая» or "coworking" would match nothing and the map would light nothing
// up. Never displayed — `SearchRooms` matches on them and nothing else does.
var roomAliases = map[string]string{
	// ---- floor 1 ----
	"100":      "актовый зал ассамблея мәжіліс assembly hall конференц зал большой зал",
	"101":      "лаборатория учебная класс зертхана teaching laboratory лаба",
	"102":      "библиотека кітапхана library читальный зал книги коворкинг coworking",
	"102A":     "библиотека читальный зал кітапхана оқу залы library reading room коворкинг coworking тихая зона",
	"103":      "медпункт медицинский кабинет медичка врач больница дәрігер medical room first aid",
	"CR":       "конференц зал переговорная conference room совещание кеңес",
	"CINEMA":   "кинозал кино синема cinema просмотровый зал фильмы",
	"WC-1":     "туалет уборная санузел wc restroom дәретхана туалеты",
	"WC-2":     "туалет уборная санузел wc restroom дәретхана туалеты",
	"CAFE":     "кафе кофе столовая буфет еда обед асхана cafe canteen coffee поесть",
	"ATRIUM-N": "атриум холл северный atrium",
	"CORE-N1":  "лестница лифт эскалатор баспалдақ stairs lift elevator",
	"CORE-S1":  "лестница баспалдақ stairs",

	// ---- floor 2 ----
	"200":     "лекционная аудитория лекция дәріс lecture hall поток",
	"201":     "конференц зал совещание кеңес conference hall переговорная",
	"202":     "деканат декан dean office факультет",
	"203":     "департамент академической деятельности учебная часть академический academic activities",
	"204":     "лаборатория учебная зертхана teaching laboratory лаба",
	"205":     "склад кладовая қойма warehouse storage хранение",
	"206":     "приёмная ректора секретарь ректората rector reception",
	"207":     "ректор ректорат кабинет ректора rector токсанов сапар",
	"208":     "первый проректор проректор vice rector омирбаев серик",
	"209":     "приёмная проректоров секретарь vice rectors reception",
	"210":     "кабинет офис office",
	"211":     "кабинет офис office",
	"212":     "кабинет офис office",
	"213":     "советник ректора кеңесші advisor сабитов айдын",
	"214":     "бухгалтерия бухгалтерский учёт расчётный отдел accounting финансы зарплата",
	"215":     "кабинет офис office",
	"AI-LAB":  "ai lab лаборатория искусственного интеллекта ии зертхана искусственный интеллект",
	"217":     "маркетинг связи с общественностью пиар pr marketing public relations реклама",
	"218":     "школа образовательных программ образовательные программы school of educational programs",
	"219":     "лекционная аудитория лекция дәріс lecture hall поток",
	"220":     "служебное помещение персонал staff room қызметтік",
	"221":     "офис регистратора регистратура тіркеу registrar кеңсе документы",
	"222":     "компьютерный класс компьютеры computer lab пк айти класс",
	"223":     "лаборатория учебная зертхана teaching laboratory лаба",
	"224":     "лекционная аудитория лекция дәріс lecture hall поток",
	"225":     "служебное помещение персонал staff room қызметтік",
	"226":     "лаборатория учебная зертхана teaching laboratory лаба",
	"226A":    "лаборатория учебная зертхана teaching laboratory лаба",
	"WC-N2":   "туалет уборная санузел wc restroom дәретхана туалеты",
	"WC-S2":   "туалет уборная санузел wc restroom дәретхана туалеты",
	"VOID-2":  "атриум пустота ойық atrium void",
	"CORE-N2": "лестница лифт эскалатор баспалдақ stairs lift elevator",
	"CORE-S2": "лестница баспалдақ stairs",
	"227":     "айти it департамент отдел информационных технологий сисадмин техподдержка helpdesk it department айтишники",
	"228":     "коворкинг coworking рабочее пространство опенспейс open space зона для работы",
	"229":     "служебное помещение персонал staff room қызметтік",
	"231":     "склад кладовая қойма storage хранение",
	"232":     "служебное помещение персонал staff room қызметтік",
}

// RoomAliases is the search-only synonym bag for a room code.
func RoomAliases(code string) string { return roomAliases[code] }

type teacherSeed struct {
	Short string
	Full  string
	Dept  string
}

// teacherSeeds are the twelve placeholders `Преподаватель 1` … `Преподаватель 12`.
// The admin panel renames them (PATCH /api/v1/admin/teachers/{id}).
func teacherSeeds() []teacherSeed {
	out := make([]teacherSeed, 0, TeacherCount)
	for i := 1; i <= TeacherCount; i++ {
		name := "Преподаватель " + strconv.Itoa(i)
		out = append(out, teacherSeed{Short: name, Full: name})
	}
	return out
}

type groupSeed struct {
	Code    string
	Program string
	Year    int
}

// groupSeeds are the twenty-four placeholders `Группа 1` … `Группа 24`.
func groupSeeds() []groupSeed {
	out := make([]groupSeed, 0, GroupCount)
	for i := 1; i <= GroupCount; i++ {
		out = append(out, groupSeed{Code: "Группа " + strconv.Itoa(i), Year: 1})
	}
	return out
}

type courseSeed struct {
	Code  string
	Title string
	Dept  string
}

// courses are the five real first-year subjects of docs/BUILDING.md § Schedule.
// There are no others in the whole university.
var courses = []courseSeed{
	{Code: "AIF1303", Title: "Основы искусственного интеллекта"},
	{Code: "FC1301", Title: "Основы математического анализа"},
	{Code: "HK1105", Title: "История Казахстана"},
	{Code: "ICT1103", Title: "Информационно-коммуникационные технологии"},
	{Code: "IP1302", Title: "Введение в программирование"},
}

// courseStaff gives every course two or three of the twelve teachers, so a
// lesson can always name someone who really teaches the subject. Every teacher
// appears exactly once, which is what keeps the peak slots fillable: ten
// simultaneous lessons need ten distinct teachers.
var courseStaff = []struct {
	Course   string
	Teachers []string
}{
	{"AIF1303", []string{"Преподаватель 1", "Преподаватель 2", "Преподаватель 3"}},
	{"FC1301", []string{"Преподаватель 4", "Преподаватель 5", "Преподаватель 6"}},
	{"HK1105", []string{"Преподаватель 7", "Преподаватель 8"}},
	{"ICT1103", []string{"Преподаватель 9", "Преподаватель 10"}},
	{"IP1302", []string{"Преподаватель 11", "Преподаватель 12"}},
}

// roomCatalogue pins what each of the thirteen schedulable rooms may teach.
// The lecture halls take anything; the laboratories only take the three
// computer subjects; the two seminar rooms take the three that need a
// blackboard rather than a machine.
var roomCatalogue = []struct {
	Room    string
	Courses []string
}{
	// Lecture halls — docs/BUILDING.md: 100, 200, 219, 224.
	{"100", []string{"HK1105", "FC1301", "ICT1103", "IP1302", "AIF1303"}},
	{"200", []string{"FC1301", "HK1105", "AIF1303", "IP1302", "ICT1103"}},
	{"219", []string{"ICT1103", "IP1302", "FC1301", "HK1105", "AIF1303"}},
	{"224", []string{"IP1302", "AIF1303", "HK1105", "FC1301", "ICT1103"}},

	// Seminar rooms.
	{"CR", []string{"FC1301", "HK1105", "IP1302"}},
	{"201", []string{"HK1105", "FC1301", "ICT1103"}},

	// Laboratories.
	{"101", []string{"ICT1103", "IP1302", "AIF1303"}},
	{"204", []string{"AIF1303", "IP1302", "ICT1103"}},
	{"AI-LAB", []string{"AIF1303"}},
	{"222", []string{"ICT1103", "IP1302"}},
	{"223", []string{"IP1302", "ICT1103", "AIF1303"}},
	{"226", []string{"IP1302", "AIF1303", "ICT1103"}},
	{"226A", []string{"ICT1103", "AIF1303", "IP1302"}},
}

// timeSlots are the ten 50-minute lesson slots with 10-minute breaks,
// 08:00–17:50 local.
func timeSlots() []domain.TimeSlot {
	out := make([]domain.TimeSlot, 0, 10)
	for i := 1; i <= 10; i++ {
		hour := 7 + i
		out = append(out, domain.TimeSlot{
			ID:       ID("slot", "A/"+strconv.Itoa(i)),
			Idx:      i,
			StartsAt: domain.NewTimeOfDay(hour, 0),
			EndsAt:   domain.NewTimeOfDay(hour, 50),
		})
	}
	return out
}

// fixedLesson is a hand-placed lesson. They are laid down before the random
// filler so the demo instant always tells the same story.
type fixedLesson struct {
	Key     string
	Course  string
	Teacher string
	Room    string
	Weekday int
	Slot    int
	Span    int
	Type    domain.LessonType
	Groups  []string
}

// heroLessons build the fixed-clock demo moment, `CLOCK_FIXED_AT=
// 2026-09-08T10:47:00+05:00` — Tuesday of teaching week 3, 13 minutes before
// the end of slot 3.
//
// Ten of the thirteen schedulable rooms are busy at that instant: the three
// two-slot lessons (100, 200, 226) and the delayed one (204) are `live`, the
// six one-slot lessons (101, 219, 222, 224, AI-LAB, CR) are `ending`. Slot 4
// then carries the cancellation and the move, both inside the 90-minute NEXT
// horizon.
var heroLessons = []fixedLesson{
	// ---- slot 3, 10:00 — the NOW list ----
	{"hero-100", "HK1105", "Преподаватель 7", "100", 2, 3, 2, domain.LessonLecture,
		[]string{"Группа 1", "Группа 2", "Группа 3"}},
	{"hero-200", "FC1301", "Преподаватель 4", "200", 2, 3, 2, domain.LessonLecture,
		[]string{"Группа 4", "Группа 5"}},
	{"hero-226", "IP1302", "Преподаватель 12", "226", 2, 3, 2, domain.LessonLab,
		[]string{"Группа 12"}},
	{"hero-219", "ICT1103", "Преподаватель 9", "219", 2, 3, 1, domain.LessonLecture,
		[]string{"Группа 6", "Группа 7"}},
	{"hero-224", "IP1302", "Преподаватель 11", "224", 2, 3, 1, domain.LessonLecture,
		[]string{"Группа 8", "Группа 9"}},
	{"hero-ai-lab", "AIF1303", "Преподаватель 1", "AI-LAB", 2, 3, 1, domain.LessonLab,
		[]string{"Группа 10"}},
	{"hero-222", "ICT1103", "Преподаватель 10", "222", 2, 3, 1, domain.LessonLab,
		[]string{"Группа 11"}},
	{"hero-101", "AIF1303", "Преподаватель 2", "101", 2, 3, 1, domain.LessonLab,
		[]string{"Группа 13"}},
	{"hero-cr", "FC1301", "Преподаватель 5", "CR", 2, 3, 1, domain.LessonPractice,
		[]string{"Группа 14"}},
	// Delayed by 15 minutes → 10:15–11:05, still `live` at 10:47.
	{"hero-204-delayed", "AIF1303", "Преподаватель 3", "204", 2, 3, 1, domain.LessonLab,
		[]string{"Группа 15"}},

	// ---- slot 4, 11:00 — the NEXT list ----
	{"hero-223-cancelled", "ICT1103", "Преподаватель 10", "223", 2, 4, 1, domain.LessonLab,
		[]string{"Группа 16"}},
	{"hero-226a-moved", "AIF1303", "Преподаватель 1", "226A", 2, 4, 1, domain.LessonLab,
		[]string{"Группа 17"}},
}

const (
	// heroDelayKey is delayed, heroCancelKey cancelled and heroMoveKey moved
	// into heroMoveDestination on every Tuesday of the seeded fortnight.
	heroDelayKey        = "hero-204-delayed"
	heroCancelKey       = "hero-223-cancelled"
	heroMoveKey         = "hero-226a-moved"
	heroMoveDestination = "101"
	heroDelayMinutes    = 15
	heroDelayNote       = "Преподаватель задерживается на 15 минут"
	heroCancelNote      = "Занятие отменено"
	heroMoveNote        = "Аудитория 226A закрыта на техобслуживание"
	genericCancelNote   = "Занятие отменено"
	genericMoveNote     = "Смена аудитории"
	genericDelayedNote  = "Занятие начнётся позже"
)

// keepFree holds (weekday, slot, room) cells the random filler must leave
// empty. 101 receives the moved lesson at 11:00, and 204 stays free at 11:00
// because the delayed lesson before it runs until 11:05.
var keepFree = []struct {
	Weekday int
	Slot    int
	Room    string
}{
	{2, 4, "101"},
	{2, 4, "204"},
}

// tickerAnnouncements are the standing ticker lines, in Russian, for this
// building.
var tickerAnnouncements = []struct {
	Text     string
	Severity domain.Severity
}{
	{"Открытая лекция · Мәжіліс залы (100) · четверг, 14:00", domain.SeverityInfo},
	{"Библиотека (102) и читальный зал (102A) работают до 20:00", domain.SeverityInfo},
	{"Здание открыто 08:00–20:00 · главный вход с западной стороны, фойе", domain.SeverityInfo},
}
