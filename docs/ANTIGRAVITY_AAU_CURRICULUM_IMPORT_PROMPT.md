# KelselPDF — AAU 2026/2027 Curriculum Import & Verification Prompt

You are working on the KelselPDF academic database for Ambrose Alli University (AAU), Ekpoma.

## OBJECTIVE

Populate the AAU undergraduate academic catalogue for the 2026/2027 session.

The database must contain:

Faculty
→ Department
→ Programme
→ Level
→ Semester
→ Course Code
→ Course Title
→ Credit Units
→ Course Status (Core/Required/Elective where explicitly stated)
→ Prerequisite (only when explicitly stated)
→ Course Description/Outline (only from authoritative source)
→ Curriculum Source
→ Source URL
→ Source Year/Date
→ Verification Status
→ Last Verified

## CRITICAL ACCURACY RULE

DO NOT invent, infer, autocomplete, or guess a course, course code, credit unit, semester, prerequisite, or syllabus.

If an official current AAU curriculum cannot be found, create the programme record but leave its curriculum records empty and set:

"verification_status": "current_programme_curriculum_not_publicly_verified"

Do NOT copy a third-party course list and label it as AAU.

## SOURCE PRIORITY

Use sources in this order:

1. Current AAU departmental curriculum/handbook explicitly applicable to 2026/2027.
2. Current AAU faculty/department page.
3. Current AAU official admission notice.
4. Older official AAU departmental handbook — ONLY as historical curriculum data.
5. NUC/JAMB documents only when needed for corroboration.
6. Third-party websites are NOT authoritative for curriculum data. They may be used only to locate a possible source; never publish their curriculum as verified AAU data.

Official current programme authority:
https://aauekpoma.edu.ng/sales-of-2026-2027-academic-session-undergraduate-admission-form/

Official AAU document repositories:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/
https://aauekpoma.edu.ng/wp-content/uploads/2022/04/

## PROGRAMME CATALOGUE

Import the attached JSON file:
aau_2026_2027_programmes.json

It contains the 73 programmes listed in AAU's official 2026/2027 admission notice.

IMPORTANT:
Preserve the exact current programme names from the 2026/2027 admission notice.

Do not silently rename:
- Plant Science & Biotechnology to Botany
- Fine & Visual Arts to Fine & Applied Arts
- Electrical/Electronics Engineering to Electrical, Electronics & Computer Engineering
- Human Kinetics Education to Physical Education
- Chemistry [Pure] to an inferred alternative name

Historical names may be stored as aliases only.

## CURRICULUM STATUS VALUES

Use exactly one:

current_official_verified
official_historical
current_programme_curriculum_not_publicly_verified
conflicting_official_sources
department_confirmation_required

## IMPORTANT HISTORICAL-HANDBOOK RULE

AAU has official handbooks hosted in older repositories, including 2022/older material.

If a handbook is official AAU but its date/session is older and you cannot prove it is the 2026/2027 curriculum:

- import it as historical curriculum evidence;
- set verification_status = "official_historical";
- set curriculum_session = null or the session explicitly stated by the handbook;
- show a visible badge in KelselPDF:
  "Official AAU source — historical curriculum; current session not independently verified."

Never display historical data as "2026/2027 confirmed".

## KNOWN OFFICIAL AAU CURRICULUM SOURCES

Use these when applicable:

Computer Science:
https://aauekpoma.edu.ng/wp-content/uploads/2022/04/computer-science-Hand-Book.pdf

Accounting:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/Department-of-Accounting-Handbook-.pdf

Banking & Finance:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-BANKING-AND-FINANCE-HANDBOOK.pdf

Business Administration:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-BUSINESS-ADMINISTRATION-HANDBOOK.pdf

Business Education:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-BUSINESS-EDUCATION-HANDBOOK.pdf

Chemistry:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-CHEMISTRY-HANDBOOK.pdf

Curriculum & Instruction:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-CURRICULUM-AND-INSTRUCTION-HANDBOOK.pdf

Geography & Environmental Management:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-GEOGRAPHY-AND-ENVIRONMENTAL-MANAGEMENT-HANDBOOK.pdf

Guidance & Counselling:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-GUIDANCE-AND-COUNSELLING-HANDBOOK.pdf

Public Administration:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-PUBLIC-ADMINISTRATION-HANDBOOK.pdf

Religious Management & Cultural Studies:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/DEPARTMENT-OF-RELIGIOUS-MANAGEMENT-AND-CULTURAL-STUDIES-HANDBOOK.pdf

Physiology:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/HANDBOOK-FOR-PHYSIOLOGY-DEPARTMENT.pdf

Human Kinetics & Health:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/HKH-DEPARTMENTAL-HANDBOOK.pdf

Plant Science & Biotechnology:
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/PSB-Handbook-2022.pdf

Botany (historical/legacy source):
https://aauekpoma.edu.ng/wp-content/uploads/2022/03/Botany-Handbook.pdf

Vocational & Technical Education:
https://aauekpoma.edu.ng/wp-content/uploads/2022/04/VTE-CURRENT-HANDBOOK.pdf

Fine & Applied Arts (historical/legacy name):
https://aauekpoma.edu.ng/wp-content/uploads/2022/04/DEPARTMENT-OF-FINE-AND-APPLIED-ARTS-HANDBOOK.pdf

## COURSE RECORD SCHEMA

Create records like:

{
  "programme_id": "aau-2026-063",
  "programme_name": "Computer Science",
  "level": 200,
  "semester": "First Semester",
  "course_code": "CSC 201",
  "course_title": "Web Development",
  "credit_units": 3,
  "course_status": "Core",
  "prerequisites": [],
  "course_description": null,
  "curriculum_session": null,
  "source_type": "official_aau_handbook",
  "source_title": "Department of Computer Science Handbook",
  "source_url": "https://aauekpoma.edu.ng/wp-content/uploads/2022/04/computer-science-Hand-Book.pdf",
  "source_year": 2022,
  "verification_status": "official_historical",
  "last_verified": "2026-09-26"
}

Do not add a description unless it is actually present in the source.

## CURRENT PROGRAMME VS HISTORICAL CURRICULUM

Example:

Current programme:
"Plant Science & Biotechnology"

Historical source:
"Botany Handbook"

Do NOT automatically merge the historical Botany curriculum into Plant Science & Biotechnology.

Instead:
- keep the current programme;
- record the Botany handbook as a historical/legacy source;
- record the relationship as an alias or legacy curriculum;
- mark current curriculum verification as pending.

## SEMESTER STRUCTURE

Support:
100 Level / First Semester
100 Level / Second Semester
200 Level / First Semester
200 Level / Second Semester
300 Level / First Semester
300 Level / Second Semester
400 Level / First Semester
400 Level / Second Semester
500 Level / First Semester
500 Level / Second Semester

Only create levels actually supported by the programme's authoritative curriculum.

Do not assume every programme has 500 level.

For programmes such as Medicine & Surgery, do not force the normal B.Sc. four-level structure. Preserve the actual professional/clinical structure documented by AAU.

## COURSE STATUS

Only use:
- Core
- Required
- Elective
- Unknown

Do not infer Core/Required/Elective from course-code patterns.

## COURSE OUTLINES

Where AAU explicitly provides course descriptions/topics, store them.

Separate:
course_description
course_topics
learning_objectives

Do not generate syllabus topics using AI and present them as AAU's official syllabus.

If AI-generated study notes are later added, store them separately as:

content_type = "KelselPDF_generated_learning_content"

and never mix them with:

content_type = "AAU_official_curriculum"

## DUPLICATE COURSE HANDLING

If the same course appears in several programmes, create one canonical course entity and programme-semester mappings.

Example:

courses:
CSC-201

programme_course_offerings:
Computer Science / 200 / First Semester / CSC-201
Computer Science Education / relevant level / semester / CSC-201

Do not create duplicate course definitions unless the code/title actually differs.

## CONFLICT HANDLING

If two official AAU sources disagree:

1. Do not choose silently.
2. Preserve both source records.
3. Set:
   verification_status = "conflicting_official_sources"
4. Display:
   "AAU sources conflict — departmental confirmation required."

## ADMIN UI REQUIREMENT

Create an admin curriculum-verification page with:

- Programme
- Faculty
- Level
- Semester
- Course code
- Course title
- Units
- Source
- Source date
- Verification status
- Last verified
- Approve
- Reject
- Flag conflict
- Edit
- View source

Add filters:
- Current verified
- Historical
- Pending verification
- Conflicting
- Department confirmation required

## STUDENT UI REQUIREMENT

Students should see:

"AAU 2026/2027 Programme Catalogue"

and for each curriculum:

GREEN:
"Official AAU curriculum — verified"

YELLOW:
"Official AAU historical curriculum — current session not independently verified"

ORANGE:
"Programme confirmed for 2026/2027 — current curriculum pending verification"

RED:
"AAU sources conflict — confirmation required"

Do not hide uncertainty.

## IMPORT SAFETY

Before writing to production:

1. Validate all 73 programme records.
2. Check duplicate programme names.
3. Check duplicate course codes within the same programme/semester.
4. Check missing credit units.
5. Check invalid semester values.
6. Check source URLs.
7. Check that every curriculum record has a source.
8. Generate an import report.
9. Do not publish records marked conflicting or department_confirmation_required.
10. Do not overwrite existing KelselPDF curriculum data without creating a version/snapshot.

## VERSIONING

Use:

curriculum_version_id

Example:
AAU-CS-2022-HB-01

and:

academic_session:
2026/2027

These are NOT the same thing.

A 2022 handbook imported for research must not be represented as a 2026/2027 curriculum merely because it is being used inside the 2026/2027 database.

## REQUIRED FINAL REPORT

After import, report:

- Total current programmes
- Total curriculum records
- Total courses
- Number current_official_verified
- Number official_historical
- Number pending
- Number conflicting
- Number requiring department confirmation
- Number of programmes with no curriculum source
- Number of duplicate courses
- Number of missing units
- Number of records without source URLs

Do not claim 100% verified unless every curriculum record has a current official AAU source.

## DO NOT DO THESE THINGS

NEVER:
- invent AAU courses;
- infer courses from another university;
- use a random "AAU course outline" website as authoritative;
- silently rename programmes;
- turn an old handbook into a current curriculum;
- invent course units;
- invent prerequisites;
- invent course descriptions;
- claim departmental confirmation when none exists;
- delete historical curriculum versions.

The goal is an auditable AAU curriculum database for KelselPDF, not merely a large list.
