import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import type { CalDAVHttp } from "../caldav-http.js";
import { addCancelledRecurrenceException } from "../ics-utils.js";
import { createCalendarUrlSchema } from "../validation.js";

type DeleteEventInput = {
	uid: string;
	calendarUrl: string;
	etag?: string;
	recurrenceDate?: string;
};

export function registerDeleteEvent(
	client: CalDAVClient,
	server: McpServer,
	baseUrl: string,
	caldavHttp: CalDAVHttp,
) {
	server.registerTool(
		"delete-event",
		{
			description:
				"Deletes an event or a single instance of a recurring event from the calendar specified by its URL",
			inputSchema: {
				uid: z.string(),
				calendarUrl: createCalendarUrlSchema(baseUrl),
				etag: z.string().optional().describe("ETag for conditional deletion"),
				recurrenceDate: z
					.string()
					.datetime()
					.optional()
					.describe(
						"For recurring events: the start time of the specific instance to delete (ISO 8601). When omitted, the entire event/series is deleted.",
					),
			},
		},
		async (args: DeleteEventInput) => {
			const { uid, calendarUrl, etag, recurrenceDate } = args;

			if (recurrenceDate) {
				const normalizedUrl = calendarUrl.endsWith("/")
					? calendarUrl.slice(0, -1)
					: calendarUrl;
				const href = `${normalizedUrl}/${uid}.ics`;
				const { icsData, etag: currentEtag } = await caldavHttp.getICS(href);
				const modifiedIcs = addCancelledRecurrenceException(
					icsData,
					new Date(recurrenceDate),
				);
				await caldavHttp.putICS(href, modifiedIcs, currentEtag);
				return {
					content: [{ type: "text", text: "Recurring event instance deleted" }],
				};
			}

			await client.deleteEvent(calendarUrl, uid, etag);
			return {
				content: [{ type: "text", text: "Event deleted" }],
			};
		},
	);
}
