package seed

import (
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

// Departments used by teachers and courses.
const (
	deptCS   = "Dept. of Computer Science"
	deptSE   = "School of Software Engineering"
	deptCB   = "Dept. of Cybersecurity"
	deptDS   = "Dept. of Data Science & AI"
	deptMA   = "Dept. of Mathematics"
	deptPH   = "Dept. of Physics & Electronics"
	deptIT   = "Dept. of IT Management"
	deptLang = "Dept. of Languages"
	deptHum  = "Dept. of Humanities"
)

type teacherSeed struct {
	Short string
	Full  string
	Dept  string
}

// teachers are 40 invented Kazakh and Russian staff members. The first
// fourteen are the ones the design's screens name, so the demo board reads
// exactly like docs/design/src/states.mjs.
var teachers = []teacherSeed{
	{"Akhmetov D.", "Akhmetov Daniyar Bolatuly", deptCS},
	{"Nurgaliyeva A.", "Nurgaliyeva Aigerim Serikovna", deptSE},
	{"Smirnov P.", "Smirnov Pavel Andreevich", deptMA},
	{"Kim V.", "Kim Vladimir Sergeevich", deptSE},
	{"Sadykova G.", "Sadykova Gulnara Maratovna", deptDS},
	{"Bekzhanov T.", "Bekzhanov Timur Askarovich", deptCB},
	{"Ivanova E.", "Ivanova Elena Viktorovna", deptPH},
	{"Orazbayev N.", "Orazbayev Nurlan Kairatuly", deptCS},
	{"Kairatova M.", "Kairatova Madina Nurlanovna", deptSE},
	{"Petrova O.", "Petrova Olga Dmitrievna", deptDS},
	{"Zhumabekov S.", "Zhumabekov Sanzhar Erlanuly", deptIT},
	{"Alimov R.", "Alimov Ruslan Maratovich", deptCS},
	{"Abenov Y.", "Abenov Yerlan Talgatuly", deptIT},
	{"Tleuberdiyev A.", "Tleuberdiyev Azamat Nurbolatuly", deptCS},

	{"Amangeldy K.", "Amangeldy Karina Bekzatovna", deptSE},
	{"Baiseitova Z.", "Baiseitova Zarina Muratovna", deptDS},
	{"Volkov I.", "Volkov Igor Nikolaevich", deptPH},
	{"Dosmukhamedov B.", "Dosmukhamedov Bauyrzhan Serikuly", deptCB},
	{"Yesimova A.", "Yesimova Aliya Kanatovna", deptMA},
	{"Zhaksylykov M.", "Zhaksylykov Miras Talgatuly", deptCS},
	{"Ismailova D.", "Ismailova Dinara Rustemovna", deptLang},
	{"Kuznetsov S.", "Kuznetsov Sergey Olegovich", deptCS},
	{"Lebedeva N.", "Lebedeva Natalia Igorevna", deptHum},
	{"Mukhtarov Zh.", "Mukhtarov Zhandos Aidarovich", deptIT},
	{"Nikolaev A.", "Nikolaev Anton Pavlovich", deptSE},
	{"Omarova S.", "Omarova Saltanat Bakytovna", deptLang},
	{"Pak A.", "Pak Andrey Vladimirovich", deptPH},
	{"Rakhimova L.", "Rakhimova Laura Serikovna", deptDS},
	{"Serikbay N.", "Serikbay Nurzhan Askaruly", deptCB},
	{"Tulegenova A.", "Tulegenova Aizhan Muratovna", deptMA},
	{"Utegenov D.", "Utegenov Daulet Zhandosuly", deptCS},
	{"Fedorov K.", "Fedorov Konstantin Yurievich", deptMA},
	{"Khasenova B.", "Khasenova Botagoz Nurlanovna", deptHum},
	{"Tsoi E.", "Tsoi Evgeny Alexandrovich", deptSE},
	{"Chernova V.", "Chernova Vera Mikhailovna", deptLang},
	{"Shaimerdenov A.", "Shaimerdenov Arman Bakytuly", deptIT},
	{"Erbolatova G.", "Erbolatova Gauhar Erbolatovna", deptDS},
	{"Yusupova R.", "Yusupova Rimma Ilhamovna", deptHum},
	{"Yakovlev D.", "Yakovlev Dmitry Sergeevich", deptCB},
	{"Beisenov T.", "Beisenov Talgat Muratuly", deptPH},
}

type groupSeed struct {
	Code    string
	Program string
	Year    int
}

// groups are the 30 student groups of the demo faculty.
var groups = []groupSeed{
	{"ПО2301", "Software Engineering", 3},
	{"ПО2302", "Software Engineering", 3},
	{"ПО2303", "Software Engineering", 3},
	{"ПО2304", "Software Engineering", 3},
	{"ПО2305", "Software Engineering", 3},
	{"ПО2306", "Software Engineering", 3},
	{"ПО2307", "Software Engineering", 3},
	{"ПО2308", "Software Engineering", 3},
	{"ПО2309", "Software Engineering", 3},
	{"ПО2310", "Software Engineering", 3},
	{"ПО2401", "Software Engineering", 2},
	{"ПО2402", "Software Engineering", 2},
	{"ПО2403", "Software Engineering", 2},
	{"ПО2404", "Software Engineering", 2},
	{"ИС2301", "Information Systems", 3},
	{"ИС2302", "Information Systems", 3},
	{"ИС2303", "Information Systems", 3},
	{"ИС2304", "Information Systems", 3},
	{"ВТ2401", "Computer Engineering", 2},
	{"ВТ2402", "Computer Engineering", 2},
	{"ВТ2403", "Computer Engineering", 2},
	{"ВТ2404", "Computer Engineering", 2},
	{"БДА2401", "Big Data & Analytics", 2},
	{"БДА2402", "Big Data & Analytics", 2},
	{"БДА2403", "Big Data & Analytics", 2},
	{"БДА2404", "Big Data & Analytics", 2},
	{"КБ2401", "Cybersecurity", 2},
	{"КБ2402", "Cybersecurity", 2},
	{"КБ2403", "Cybersecurity", 2},
	{"КБ2404", "Cybersecurity", 2},
}

type courseSeed struct {
	Code  string
	Title string
	Dept  string
}

// courses are the 50 subjects. Codes match the design's screens wherever it
// names one.
var courses = []courseSeed{
	{"CS110", "Programming I", deptCS},
	{"CS201", "Databases", deptCS},
	{"CS210", "Data Structures", deptCS},
	{"CS220", "Computer Architecture", deptCS},
	{"CS250", "Algorithms", deptCS},
	{"CS305", "Operating Systems", deptCS},
	{"CS310", "Compilers", deptCS},
	{"CS330", "Computer Networks", deptCS},
	{"CS405", "Distributed Systems", deptCS},
	{"CS420", "Cloud Computing", deptCS},
	{"CS440", "Blockchain Systems", deptCS},
	{"SE210", "Software Design", deptSE},
	{"SE240", "Software Testing", deptSE},
	{"SE320", "Mobile Development", deptSE},
	{"SE330", "Web Development", deptSE},
	{"SE410", "Software Architecture", deptSE},
	{"AI210", "Introduction to AI", deptDS},
	{"AI320", "Machine Learning", deptDS},
	{"ML410", "Deep Learning", deptDS},
	{"DS215", "Statistics", deptDS},
	{"DS330", "Data Mining", deptDS},
	{"DS410", "Big Data Systems", deptDS},
	{"CB240", "Network Security", deptCB},
	{"CB310", "Cryptography", deptCB},
	{"CB350", "Ethical Hacking", deptCB},
	{"CB420", "Digital Forensics", deptCB},
	{"MA101", "Discrete Math", deptMA},
	{"MA201", "Linear Algebra", deptMA},
	{"MA210", "Calculus", deptMA},
	{"MA310", "Probability Theory", deptMA},
	{"MA320", "Numerical Methods", deptMA},
	{"PH101", "Physics", deptPH},
	{"PH210", "Electronics", deptPH},
	{"IOT310", "IoT Systems", deptPH},
	{"RB210", "Robotics", deptPH},
	{"RB320", "Computer Vision", deptDS},
	{"ST300", "Startup Studio", deptIT},
	{"PM200", "Project Management", deptIT},
	{"PM310", "Product Management", deptIT},
	{"EC210", "Economics of IT", deptIT},
	{"LW220", "IT Law", deptIT},
	{"UX240", "UX Design", deptSE},
	{"EN101", "English for IT", deptLang},
	{"EN205", "Academic Writing", deptLang},
	{"KZ100", "Kazakh Language", deptLang},
	{"KZ210", "Kazakh for Professionals", deptLang},
	{"RU110", "Russian Language", deptLang},
	{"HI101", "History of Kazakhstan", deptHum},
	{"PL200", "Philosophy", deptHum},
	{"OL100", "Open Lecture", deptIT},
}

// themedLabs pins the course catalogue of the five named laboratories
// (ARCHITECTURE §13): each one only ever teaches its own subject.
var themedLabs = map[string][]string{
	"210": {"IOT310"},         // Samsung Innovation Lab
	"211": {"ST300"},          // Astana Hub Startup Lab
	"112": {"RB210"},          // Skywalkers Robotics Lab
	"313": {"CB240", "CB310"}, // Cyber Range Lab
	"413": {"ML410", "AI320"}, // AI & GPU Lab
}

// programCourses biases each group's programme towards its own subjects; the
// general education courses below are open to everyone.
var programCourses = map[string][]string{
	"Software Engineering": {"CS110", "CS201", "CS210", "CS250", "CS305", "CS310", "CS330", "CS405", "CS420", "CS440", "SE210", "SE240", "SE320", "SE330", "SE410", "UX240", "PM200"},
	"Information Systems":  {"CS201", "CS210", "CS250", "CS330", "CS420", "DS215", "DS330", "PM200", "PM310", "EC210", "LW220", "SE240"},
	"Computer Engineering": {"CS220", "CS330", "PH101", "PH210", "IOT310", "RB210", "RB320", "CS110", "MA210"},
	"Big Data & Analytics": {"DS215", "DS330", "DS410", "AI210", "AI320", "ML410", "MA310", "MA320", "CS201"},
	"Cybersecurity":        {"CB240", "CB310", "CB350", "CB420", "CS330", "CS220", "MA101", "CS440"},
}

// generalCourses can be taught to any programme.
var generalCourses = []string{"MA101", "MA201", "MA210", "EN101", "EN205", "KZ100", "KZ210", "RU110", "HI101", "PL200", "PH101"}

// timeSlots are the ten 50-minute lesson slots with 10-minute breaks,
// 08:00–17:50 local (ARCHITECTURE §13).
func timeSlots() []domain.TimeSlot {
	out := make([]domain.TimeSlot, 0, 10)
	for i := 1; i <= 10; i++ {
		hour := 7 + i
		out = append(out, domain.TimeSlot{
			ID:       ID("slot", "A/"+itoa(i)),
			Idx:      i,
			StartsAt: domain.NewTimeOfDay(hour, 0),
			EndsAt:   domain.NewTimeOfDay(hour, 50),
		})
	}
	return out
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	return string(b)
}

// fixedLesson is a hand-placed lesson: the demo's hero rows, the themed-lab
// classes and the weekly open lecture. They are laid down before the random
// filler so the board always tells the story the design tells.
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

// heroLessons is the Tuesday of docs/design/src/states.mjs, plus the Thursday
// open lecture in the Assembly Hall.
var heroLessons = []fixedLesson{
	{"hero-cs201", "CS201", "Akhmetov D.", "213", 2, 3, 2, domain.LessonLecture, []string{"ПО2308", "ПО2309"}},
	{"hero-cs110", "CS110", "Nurgaliyeva A.", "101", 2, 3, 1, domain.LessonLecture, []string{"ПО2401", "ПО2402"}},
	{"hero-ma101-305", "MA101", "Smirnov P.", "305", 2, 3, 1, domain.LessonPractice, []string{"ИС2301"}},
	{"hero-se330", "SE330", "Kim V.", "216", 2, 3, 1, domain.LessonLab, []string{"ПО2310"}},
	{"hero-ai320", "AI320", "Sadykova G.", "412", 2, 3, 1, domain.LessonLab, []string{"БДА2401"}},
	{"hero-cb240", "CB240", "Bekzhanov T.", "313", 2, 3, 1, domain.LessonLab, []string{"КБ2401"}},
	{"hero-ph101", "PH101", "Ivanova E.", "110", 2, 3, 2, domain.LessonLecture, []string{"ВТ2401", "ВТ2402"}},
	{"hero-cs250", "CS250", "Orazbayev N.", "303", 2, 4, 1, domain.LessonPractice, []string{"ИС2301", "ИС2302"}},
	{"hero-ma101-101", "MA101", "Smirnov P.", "101", 2, 4, 1, domain.LessonLecture, []string{"ПО2401", "ПО2402"}},
	{"hero-se210", "SE210", "Kairatova M.", "216", 2, 4, 1, domain.LessonPractice, []string{"ПО2310"}},
	{"hero-ds215", "DS215", "Petrova O.", "412", 2, 4, 1, domain.LessonPractice, []string{"БДА2401"}},
	{"hero-pm200", "PM200", "Zhumabekov S.", "205", 2, 5, 1, domain.LessonPractice, []string{"ПО2308"}},
	{"hero-cs305", "CS305", "Alimov R.", "213", 2, 5, 1, domain.LessonLecture, []string{"ИС2301"}},
	{"hero-st300", "ST300", "Abenov Y.", "211", 2, 5, 1, domain.LessonLab, []string{"ПО2309"}},
	{"hero-rb210", "RB210", "Alimov R.", "112", 2, 6, 1, domain.LessonLab, []string{"ВТ2402"}},
	{"hero-cs405", "CS405", "Akhmetov D.", "213", 2, 7, 1, domain.LessonLecture, []string{"ПО2308"}},
	{"hero-iot310", "IOT310", "Kim V.", "210", 2, 7, 1, domain.LessonLab, []string{"ВТ2401"}},
	{"hero-cb310", "CB310", "Bekzhanov T.", "313", 2, 7, 1, domain.LessonLab, []string{"КБ2401", "КБ2402"}},
	{"hero-ml410", "ML410", "Sadykova G.", "412", 2, 7, 1, domain.LessonLab, []string{"БДА2401"}},
	{"hero-en205", "EN205", "Petrova O.", "219", 2, 7, 1, domain.LessonLab, []string{"ИС2302"}},
	{"hero-se320", "SE320", "Kim V.", "213", 2, 9, 1, domain.LessonLecture, []string{"ПО2310"}},

	// The weekly Open Lecture in the Assembly Hall (ARCHITECTURE §13).
	{"open-lecture", "OL100", "Abenov Y.", "110", 4, 7, 2, domain.LessonLecture,
		[]string{"ПО2308", "ПО2309", "ПО2310", "ИС2301"}},
}

// keepFree holds (weekday, room, slot) triples the random filler must leave
// empty so the scripted demo overrides land cleanly: 313 must be free at 11:00
// for the delayed CB240 to run into, and 414 must be free at 11:00 to receive
// the moved DS215.
var keepFree = []struct {
	Weekday int
	Room    string
	Slot    int
}{
	{2, "313", 4},
	{2, "414", 4},
}

// tickerAnnouncements are the standing ticker lines (docs/design/src/states.mjs
// HERO_TICKER). The override-derived lines are generated by the client from the
// board itself, so only the informational ones are stored.
var tickerAnnouncements = []struct {
	Text     string
	Severity domain.Severity
}{
	{`Open Lecture · Assembly Hall "Aula" 110 · Thu 14:00 · guest speaker from Astana Hub`, domain.SeverityInfo},
	{`Library & Reading Room 113 open until 22:00`, domain.SeverityInfo},
	{`Building A is open 07:30–22:00 · main entrance W, Main Lobby`, domain.SeverityInfo},
}
