import { describe, expect, test } from "vitest";
import {
	addCancelledRecurrenceException,
	addExdate,
	addRecurrenceException,
	updateMasterEvent,
} from "./ics-utils.js";

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-123
DTSTART:20250301T190000Z
DTEND:20250301T200000Z
SUMMARY:저녁
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;

const RECURRING_ICS_WITH_EXDATE = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:recurring-456
DTSTART:20250301T190000Z
DTEND:20250301T200000Z
SUMMARY:운동
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
EXDATE:20250303T190000Z
END:VEVENT
END:VCALENDAR`;

const WHOLE_DAY_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:wholeday-789
DTSTART;VALUE=DATE:20250301
DTEND;VALUE=DATE:20250302
SUMMARY:휴일
RRULE:FREQ=YEARLY
END:VEVENT
END:VCALENDAR`;

const RECURRING_ICS_WITH_TZID = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:Asia/Seoul
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0900
TZOFFSETTO:+0900
TZNAME:KST
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:tzid-event-123
DTSTART;TZID=Asia/Seoul:20250301T190000
DTEND;TZID=Asia/Seoul:20250301T200000
SUMMARY:저녁
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;

const NON_RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:single-101
DTSTART:20250315T100000Z
DTEND:20250315T110000Z
SUMMARY:회의
DESCRIPTION:팀 미팅
LOCATION:회의실 A
END:VEVENT
END:VCALENDAR`;

describe("addExdate", () => {
	test("adds EXDATE to a recurring event", () => {
		const result = addExdate(RECURRING_ICS, new Date("2025-03-05T19:00:00Z"));

		expect(result).toContain("EXDATE");
		expect(result).toContain("20250305T190000Z");
		expect(result).toContain("RRULE:FREQ=DAILY");
		expect(result).toContain("UID:recurring-123");
	});

	test("preserves existing EXDATEs when adding a new one", () => {
		const result = addExdate(
			RECURRING_ICS_WITH_EXDATE,
			new Date("2025-03-05T19:00:00Z"),
		);

		expect(result).toContain("20250303T190000Z");
		expect(result).toContain("20250305T190000Z");
	});

	test("handles whole-day recurring events", () => {
		const result = addExdate(
			WHOLE_DAY_RECURRING_ICS,
			new Date("2026-03-01T00:00:00Z"),
		);

		expect(result).toContain("EXDATE");
		expect(result).toContain("20260301");
		expect(result).not.toContain("T000000Z");
	});

	test("adds EXDATE with matching TZID when master uses TZID", () => {
		// 2025-03-05 19:00 KST = 2025-03-05 10:00 UTC
		const result = addExdate(
			RECURRING_ICS_WITH_TZID,
			new Date("2025-03-05T10:00:00Z"),
		);

		// EXDATE should have TZID parameter and local time (not UTC Z suffix)
		expect(result).toContain("TZID=Asia/Seoul");
		expect(result).toContain("20250305T190000");
		// Should NOT contain UTC Z suffix in the EXDATE value
		expect(result).not.toMatch(/EXDATE[^:]*:20250305T100000Z/);
	});

	test("throws if no master VEVENT found", () => {
		const noVevent = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

		expect(() => addExdate(noVevent, new Date("2025-03-05T19:00:00Z"))).toThrow(
			"No master VEVENT found",
		);
	});
});

describe("addCancelledRecurrenceException", () => {
	test("creates cancelled exception VEVENT with RECURRENCE-ID and STATUS:CANCELLED", () => {
		const result = addCancelledRecurrenceException(
			RECURRING_ICS,
			new Date("2025-03-05T19:00:00Z"),
		);

		expect(result).toContain("RECURRENCE-ID:20250305T190000Z");
		expect(result).toContain("STATUS:CANCELLED");
		expect(result).toContain("UID:recurring-123");
		// Master VEVENT should still be there
		expect(result).toContain("RRULE:FREQ=DAILY");
		// Should inherit summary from master
		expect(result).toContain("SUMMARY:저녁");
	});

	test("creates cancelled exception with matching TZID when master uses TZID", () => {
		// 2025-03-05 19:00 KST = 2025-03-05 10:00 UTC
		const result = addCancelledRecurrenceException(
			RECURRING_ICS_WITH_TZID,
			new Date("2025-03-05T10:00:00Z"),
		);

		expect(result).toMatch(/RECURRENCE-ID;TZID=Asia\/Seoul:20250305T190000/);
		expect(result).toMatch(/DTSTART;TZID=Asia\/Seoul:20250305T190000/);
		expect(result).toMatch(/DTEND;TZID=Asia\/Seoul:20250305T200000/);
		expect(result).toContain("STATUS:CANCELLED");
	});

	test("handles whole-day recurring events", () => {
		const result = addCancelledRecurrenceException(
			WHOLE_DAY_RECURRING_ICS,
			new Date("2026-03-01T00:00:00Z"),
		);

		expect(result).toContain("RECURRENCE-ID");
		expect(result).toContain("20260301");
		expect(result).toContain("STATUS:CANCELLED");
		expect(result).not.toMatch(/RECURRENCE-ID[^:]*:20260301T/);
	});

	test("sets STATUS:CANCELLED on existing exception VEVENT", () => {
		// First create a regular exception
		const withException = addRecurrenceException(
			RECURRING_ICS,
			new Date("2025-03-05T19:00:00Z"),
			{ summary: "변경된 저녁" },
		);

		// Then cancel it
		const result = addCancelledRecurrenceException(
			withException,
			new Date("2025-03-05T19:00:00Z"),
		);

		expect(result).toContain("STATUS:CANCELLED");
		// Should have only one RECURRENCE-ID (updated, not duplicated)
		const recurrenceIdCount = (result.match(/RECURRENCE-ID/g) || []).length;
		expect(recurrenceIdCount).toBe(1);
	});

	test("preserves master VEVENT unchanged", () => {
		const result = addCancelledRecurrenceException(
			RECURRING_ICS,
			new Date("2025-03-05T19:00:00Z"),
		);

		expect(result).toContain("DTSTART:20250301T190000Z");
		expect(result).toContain("DTEND:20250301T200000Z");
		expect(result).toContain("RRULE:FREQ=DAILY");
	});

	test("throws if no master VEVENT found", () => {
		const noVevent = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

		expect(() =>
			addCancelledRecurrenceException(
				noVevent,
				new Date("2025-03-05T19:00:00Z"),
			),
		).toThrow("No master VEVENT found");
	});
});

describe("addRecurrenceException", () => {
	test("creates exception VEVENT with RECURRENCE-ID and modified properties", () => {
		const result = addRecurrenceException(
			RECURRING_ICS,
			new Date("2025-03-05T19:00:00Z"),
			{
				summary: "늦은 저녁",
				start: new Date("2025-03-05T20:00:00Z"),
				end: new Date("2025-03-05T21:00:00Z"),
			},
		);

		expect(result).toContain("RECURRENCE-ID:20250305T190000Z");
		expect(result).toContain("SUMMARY:늦은 저녁");
		expect(result).toContain("DTSTART:20250305T200000Z");
		expect(result).toContain("DTEND:20250305T210000Z");
		expect(result).toContain("UID:recurring-123");
		// Master VEVENT should still be there
		expect(result).toContain("RRULE:FREQ=DAILY");
	});

	test("inherits unmodified properties from master VEVENT", () => {
		const result = addRecurrenceException(
			RECURRING_ICS,
			new Date("2025-03-05T19:00:00Z"),
			{ start: new Date("2025-03-05T20:00:00Z") },
		);

		// Should inherit summary from master
		expect(result).toContain("SUMMARY:저녁");
		// Should compute end from master duration (1 hour)
		expect(result).toContain("DTEND:20250305T210000Z");
	});

	test("updates existing exception if one already exists for same date", () => {
		// First add an exception
		const withException = addRecurrenceException(
			RECURRING_ICS,
			new Date("2025-03-05T19:00:00Z"),
			{ summary: "변경1" },
		);

		// Then update it
		const result = addRecurrenceException(
			withException,
			new Date("2025-03-05T19:00:00Z"),
			{ summary: "변경2" },
		);

		// Should have only one exception VEVENT, not two
		const recurrenceIdCount = (result.match(/RECURRENCE-ID/g) || []).length;
		expect(recurrenceIdCount).toBe(1);
		expect(result).toContain("SUMMARY:변경2");
	});

	test("creates exception with matching TZID when master uses TZID", () => {
		// 2025-03-05 19:00 KST = 2025-03-05 10:00 UTC
		// Modify to 20:00 KST = 11:00 UTC
		const result = addRecurrenceException(
			RECURRING_ICS_WITH_TZID,
			new Date("2025-03-05T10:00:00Z"),
			{
				start: new Date("2025-03-05T11:00:00Z"),
				end: new Date("2025-03-05T12:00:00Z"),
			},
		);

		// RECURRENCE-ID should have TZID and local time
		expect(result).toMatch(/RECURRENCE-ID;TZID=Asia\/Seoul:20250305T190000/);
		// Exception DTSTART should have TZID and local time (20:00 KST)
		expect(result).toMatch(/DTSTART;TZID=Asia\/Seoul:20250305T200000/);
		// Exception DTEND should have TZID and local time (21:00 KST)
		expect(result).toMatch(/DTEND;TZID=Asia\/Seoul:20250305T210000/);
	});

	test("throws if no master VEVENT found", () => {
		const noVevent = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

		expect(() =>
			addRecurrenceException(noVevent, new Date("2025-03-05T19:00:00Z"), {
				summary: "test",
			}),
		).toThrow("No master VEVENT found");
	});
});

describe("updateMasterEvent", () => {
	test("modifies master VEVENT properties", () => {
		const result = updateMasterEvent(RECURRING_ICS, {
			summary: "점심",
			start: new Date("2025-03-01T12:00:00Z"),
			end: new Date("2025-03-01T13:00:00Z"),
		});

		expect(result).toContain("SUMMARY:점심");
		expect(result).toContain("DTSTART:20250301T120000Z");
		expect(result).toContain("DTEND:20250301T130000Z");
		expect(result).toContain("RRULE:FREQ=DAILY");
	});

	test("preserves existing EXDATE properties", () => {
		const result = updateMasterEvent(RECURRING_ICS_WITH_EXDATE, {
			summary: "헬스",
		});

		expect(result).toContain("SUMMARY:헬스");
		expect(result).toContain("EXDATE:20250303T190000Z");
		expect(result).toContain("RRULE:FREQ=WEEKLY");
	});

	test("preserves existing exception VEVENTs", () => {
		const withException = addRecurrenceException(
			RECURRING_ICS,
			new Date("2025-03-05T19:00:00Z"),
			{ summary: "예외 저녁" },
		);

		const result = updateMasterEvent(withException, {
			summary: "아침",
		});

		expect(result).toContain("SUMMARY:아침");
		expect(result).toContain("SUMMARY:예외 저녁");
		expect(result).toContain("RECURRENCE-ID");
	});

	test("only updates provided fields", () => {
		const result = updateMasterEvent(NON_RECURRING_ICS, {
			summary: "중요 회의",
		});

		expect(result).toContain("SUMMARY:중요 회의");
		expect(result).toContain("DTSTART:20250315T100000Z");
		expect(result).toContain("DTEND:20250315T110000Z");
		expect(result).toContain("DESCRIPTION:팀 미팅");
		expect(result).toContain("LOCATION:회의실 A");
	});

	test("throws if no master VEVENT found", () => {
		const noVevent = `BEGIN:VCALENDAR
VERSION:2.0
END:VCALENDAR`;

		expect(() => updateMasterEvent(noVevent, { summary: "test" })).toThrow(
			"No master VEVENT found",
		);
	});
});
