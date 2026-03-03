import { z } from "zod";

export function createCalendarUrlSchema(baseUrl: string) {
	const allowedOrigin = new URL(baseUrl).origin;

	return z.string().refine(
		(url) => {
			try {
				const parsed = new URL(url, baseUrl);
				return parsed.origin === allowedOrigin;
			} catch {
				return false;
			}
		},
		{
			message: `calendarUrl must belong to the same origin as the CalDAV server (${allowedOrigin})`,
		},
	);
}
