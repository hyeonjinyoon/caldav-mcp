import ICAL from "ical.js";

interface EventModifications {
	summary?: string;
	start?: Date;
	end?: Date;
	description?: string;
	location?: string;
}

function findMasterVevent(vcalendar: ICAL.Component): ICAL.Component | null {
	const vevents = vcalendar.getAllSubcomponents("vevent");
	return (
		vevents.find(
			(ve: ICAL.Component) => !ve.getFirstProperty("recurrence-id"),
		) ?? null
	);
}

function findExceptionVevent(
	vcalendar: ICAL.Component,
	recurrenceDate: Date,
): ICAL.Component | null {
	const vevents = vcalendar.getAllSubcomponents("vevent");
	for (const ve of vevents) {
		const recIdProp = ve.getFirstProperty("recurrence-id");
		if (recIdProp) {
			const recIdValue = recIdProp.getFirstValue() as ICAL.Time;
			if (recIdValue?.toJSDate().getTime() === recurrenceDate.getTime()) {
				return ve;
			}
		}
	}
	return null;
}

function getMasterDuration(masterVevent: ICAL.Component): number {
	const startVal = masterVevent.getFirstProperty("dtstart")?.getFirstValue() as
		| ICAL.Time
		| undefined;
	const endVal = masterVevent.getFirstProperty("dtend")?.getFirstValue() as
		| ICAL.Time
		| undefined;
	if (startVal && endVal) {
		return endVal.toJSDate().getTime() - startVal.toJSDate().getTime();
	}
	const isDate = startVal?.isDate ?? false;
	return isDate ? 86400000 : 3600000;
}

/**
 * Registers VTIMEZONE components from the VCALENDAR with ICAL.TimezoneService.
 * This is required for timezone conversion (convertToZone) to work.
 */
function registerTimezones(vcalendar: ICAL.Component): void {
	const vtimezones = vcalendar.getAllSubcomponents("vtimezone");
	for (const vtz of vtimezones) {
		const tz = new ICAL.Timezone(vtz);
		ICAL.TimezoneService.register(tz);
	}
}

/**
 * Converts a UTC JS Date to an ICAL.Time matching the master DTSTART's timezone format.
 * - If master has TZID: converts UTC → local time in that timezone
 * - If master is UTC: returns UTC time
 * - If master is DATE (whole-day): returns DATE format
 */
function toTimezoneAwareTime(
	date: Date,
	masterDtstartProp: ICAL.Property | null,
): ICAL.Time {
	const masterTime = masterDtstartProp?.getFirstValue() as
		| ICAL.Time
		| undefined;
	const isDate = masterTime?.isDate ?? false;

	if (isDate) {
		return ICAL.Time.fromDateString(date.toISOString().split("T")[0]);
	}

	const tzid = masterDtstartProp?.getParameter("tzid") as string | undefined;

	if (tzid) {
		const utcTime = ICAL.Time.fromJSDate(date, true);
		const tz = ICAL.TimezoneService.get(tzid);
		if (tz) {
			return utcTime.convertToZone(tz);
		}
	}

	return ICAL.Time.fromJSDate(date, true);
}

/**
 * Adds a TZID parameter to a property if the master DTSTART has one.
 */
function copyTzidParam(
	prop: ICAL.Property,
	masterDtstartProp: ICAL.Property | null,
): void {
	const tzid = masterDtstartProp?.getParameter("tzid") as string | undefined;
	if (tzid) {
		prop.setParameter("tzid", tzid);
	}
}

function applyModifications(
	vevent: ICAL.Component,
	modifications: EventModifications,
): void {
	if (modifications.summary !== undefined) {
		vevent.updatePropertyWithValue("summary", modifications.summary);
	}
	if (modifications.description !== undefined) {
		vevent.updatePropertyWithValue("description", modifications.description);
	}
	if (modifications.location !== undefined) {
		vevent.updatePropertyWithValue("location", modifications.location);
	}
	if (modifications.start !== undefined) {
		const dtstart = vevent.getFirstProperty("dtstart");
		const masterTime = dtstart?.getFirstValue() as ICAL.Time | undefined;
		const isDate = masterTime?.isDate ?? false;
		const tzid = dtstart?.getParameter("tzid") as string | undefined;

		if (isDate) {
			vevent.updatePropertyWithValue(
				"dtstart",
				ICAL.Time.fromDateString(
					modifications.start.toISOString().split("T")[0],
				),
			);
		} else if (tzid) {
			const utcTime = ICAL.Time.fromJSDate(modifications.start, true);
			const tz = ICAL.TimezoneService.get(tzid);
			const localTime = tz ? utcTime.convertToZone(tz) : utcTime;
			const prop = vevent.updatePropertyWithValue("dtstart", localTime);
			prop.setParameter("tzid", tzid);
		} else {
			vevent.updatePropertyWithValue(
				"dtstart",
				ICAL.Time.fromJSDate(modifications.start, true),
			);
		}
	}
	if (modifications.end !== undefined) {
		const dtend = vevent.getFirstProperty("dtend");
		const masterTime = dtend?.getFirstValue() as ICAL.Time | undefined;
		const isDate = masterTime?.isDate ?? false;
		const tzid = dtend?.getParameter("tzid") as string | undefined;

		if (isDate) {
			vevent.updatePropertyWithValue(
				"dtend",
				ICAL.Time.fromDateString(modifications.end.toISOString().split("T")[0]),
			);
		} else if (tzid) {
			const utcTime = ICAL.Time.fromJSDate(modifications.end, true);
			const tz = ICAL.TimezoneService.get(tzid);
			const localTime = tz ? utcTime.convertToZone(tz) : utcTime;
			const prop = vevent.updatePropertyWithValue("dtend", localTime);
			prop.setParameter("tzid", tzid);
		} else {
			vevent.updatePropertyWithValue(
				"dtend",
				ICAL.Time.fromJSDate(modifications.end, true),
			);
		}
	}
}

/**
 * Adds an EXDATE to the master VEVENT to exclude a specific occurrence.
 * Used for deleting a single instance of a recurring event.
 */
export function addExdate(icsData: string, recurrenceDate: Date): string {
	const jcalData = ICAL.parse(icsData);
	const vcalendar = new ICAL.Component(jcalData);
	const masterVevent = findMasterVevent(vcalendar);

	if (!masterVevent) {
		throw new Error("No master VEVENT found in ICS data");
	}

	registerTimezones(vcalendar);

	const dtstartProp = masterVevent.getFirstProperty("dtstart");
	const exdateTime = toTimezoneAwareTime(recurrenceDate, dtstartProp);
	const prop = masterVevent.addPropertyWithValue("exdate", exdateTime);
	copyTzidParam(prop, dtstartProp);

	return vcalendar.toString();
}

/**
 * Adds an exception VEVENT with RECURRENCE-ID and STATUS:CANCELLED to cancel a specific occurrence.
 * Used for deleting a single instance of a recurring event (more compatible than EXDATE with Apple CalDAV).
 */
export function addCancelledRecurrenceException(
	icsData: string,
	recurrenceDate: Date,
): string {
	const jcalData = ICAL.parse(icsData);
	const vcalendar = new ICAL.Component(jcalData);
	const masterVevent = findMasterVevent(vcalendar);

	if (!masterVevent) {
		throw new Error("No master VEVENT found in ICS data");
	}

	registerTimezones(vcalendar);

	const existingException = findExceptionVevent(vcalendar, recurrenceDate);
	if (existingException) {
		existingException.updatePropertyWithValue("status", "CANCELLED");
		return vcalendar.toString();
	}

	const exceptionVevent = new ICAL.Component("vevent");

	const uid = masterVevent.getFirstPropertyValue("uid") as string;
	exceptionVevent.addPropertyWithValue("uid", uid);

	exceptionVevent.addPropertyWithValue(
		"dtstamp",
		ICAL.Time.fromJSDate(new Date(), true),
	);

	const dtstartProp = masterVevent.getFirstProperty("dtstart");
	const dtendProp = masterVevent.getFirstProperty("dtend");

	// RECURRENCE-ID with matching timezone
	const recurrenceId = toTimezoneAwareTime(recurrenceDate, dtstartProp);
	const recIdProp = exceptionVevent.addPropertyWithValue(
		"recurrence-id",
		recurrenceId,
	);
	copyTzidParam(recIdProp, dtstartProp);

	const duration = getMasterDuration(masterVevent);

	// DTSTART with matching timezone
	const startTime = toTimezoneAwareTime(recurrenceDate, dtstartProp);
	const startProp = exceptionVevent.addPropertyWithValue("dtstart", startTime);
	copyTzidParam(startProp, dtstartProp);

	// DTEND with matching timezone
	const endDate = new Date(recurrenceDate.getTime() + duration);
	const endTime = toTimezoneAwareTime(endDate, dtendProp ?? dtstartProp);
	const endPropEl = exceptionVevent.addPropertyWithValue("dtend", endTime);
	copyTzidParam(endPropEl, dtendProp ?? dtstartProp);

	exceptionVevent.addPropertyWithValue(
		"summary",
		(masterVevent.getFirstPropertyValue("summary") as string) ?? "",
	);

	exceptionVevent.addPropertyWithValue("status", "CANCELLED");

	vcalendar.addSubcomponent(exceptionVevent);
	return vcalendar.toString();
}

/**
 * Adds an exception VEVENT with RECURRENCE-ID to override a specific occurrence.
 * Used for modifying a single instance of a recurring event.
 */
export function addRecurrenceException(
	icsData: string,
	recurrenceDate: Date,
	modifications: EventModifications,
): string {
	const jcalData = ICAL.parse(icsData);
	const vcalendar = new ICAL.Component(jcalData);
	const masterVevent = findMasterVevent(vcalendar);

	if (!masterVevent) {
		throw new Error("No master VEVENT found in ICS data");
	}

	registerTimezones(vcalendar);

	const existingException = findExceptionVevent(vcalendar, recurrenceDate);
	if (existingException) {
		applyModifications(existingException, modifications);
		return vcalendar.toString();
	}

	const exceptionVevent = new ICAL.Component("vevent");

	const uid = masterVevent.getFirstPropertyValue("uid") as string;
	exceptionVevent.addPropertyWithValue("uid", uid);

	exceptionVevent.addPropertyWithValue(
		"dtstamp",
		ICAL.Time.fromJSDate(new Date(), true),
	);

	const dtstartProp = masterVevent.getFirstProperty("dtstart");
	const dtendProp = masterVevent.getFirstProperty("dtend");

	// RECURRENCE-ID with matching timezone
	const recurrenceId = toTimezoneAwareTime(recurrenceDate, dtstartProp);
	const recIdProp = exceptionVevent.addPropertyWithValue(
		"recurrence-id",
		recurrenceId,
	);
	copyTzidParam(recIdProp, dtstartProp);

	const duration = getMasterDuration(masterVevent);
	const effectiveStart = modifications.start ?? recurrenceDate;
	const defaultEnd = new Date(effectiveStart.getTime() + duration);

	// DTSTART with matching timezone
	const startTime = toTimezoneAwareTime(effectiveStart, dtstartProp);
	const startProp = exceptionVevent.addPropertyWithValue("dtstart", startTime);
	copyTzidParam(startProp, dtstartProp);

	// DTEND with matching timezone
	const endDate = modifications.end ?? defaultEnd;
	const endTime = toTimezoneAwareTime(endDate, dtendProp ?? dtstartProp);
	const endPropEl = exceptionVevent.addPropertyWithValue("dtend", endTime);
	copyTzidParam(endPropEl, dtendProp ?? dtstartProp);

	exceptionVevent.addPropertyWithValue(
		"summary",
		modifications.summary ??
			(masterVevent.getFirstPropertyValue("summary") as string) ??
			"",
	);

	const masterDescription = masterVevent.getFirstPropertyValue("description") as
		| string
		| null;
	if (modifications.description !== undefined || masterDescription) {
		exceptionVevent.addPropertyWithValue(
			"description",
			modifications.description ?? masterDescription ?? "",
		);
	}

	const masterLocation = masterVevent.getFirstPropertyValue("location") as
		| string
		| null;
	if (modifications.location !== undefined || masterLocation) {
		exceptionVevent.addPropertyWithValue(
			"location",
			modifications.location ?? masterLocation ?? "",
		);
	}

	vcalendar.addSubcomponent(exceptionVevent);
	return vcalendar.toString();
}

/**
 * Updates the master VEVENT while preserving existing EXDATEs and exception VEVENTs.
 * Used for updating the entire recurring series.
 */
export function updateMasterEvent(
	icsData: string,
	modifications: EventModifications,
): string {
	const jcalData = ICAL.parse(icsData);
	const vcalendar = new ICAL.Component(jcalData);
	const masterVevent = findMasterVevent(vcalendar);

	if (!masterVevent) {
		throw new Error("No master VEVENT found in ICS data");
	}

	registerTimezones(vcalendar);
	applyModifications(masterVevent, modifications);
	return vcalendar.toString();
}
