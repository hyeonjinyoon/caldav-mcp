import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { createCalendarUrlSchema } from "../validation.js";

type ListEventsInput = {
	start: string;
	end: string;
	calendarUrl: string;
	full?: boolean;
};

const dateString = z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
	message: "Invalid date string",
});

export function registerListEvents(
	client: CalDAVClient,
	server: McpServer,
	baseUrl: string,
) {
	server.registerTool(
		"list-events",
		{
			description:
				"List all events between start and end date in the calendar specified by its URL. By default excludes etag and href for brevity. Set full=true to include them (needed for delete-event).",
			inputSchema: {
				start: dateString,
				end: dateString,
				calendarUrl: createCalendarUrlSchema(baseUrl),
				full: z
					.boolean()
					.optional()
					.default(false)
					.describe(
						"Include etag and href in response (needed for delete/update operations)",
					),
			},
		},
		async (args: ListEventsInput) => {
			const { calendarUrl, start, end, full } = args;
			const options = {
				start: new Date(start),
				end: new Date(end),
			};
			const allEvents = await client.getEvents(calendarUrl, options);
			const data = allEvents.map((e) => {
				const event: Record<string, unknown> = {
					uid: e.uid,
					summary: e.summary,
					start: e.start,
					end: e.end,
					description: e.description,
					location: e.location,
					recurrenceRule: e.recurrenceRule,
				};
				if (full) {
					event.etag = e.etag;
					event.href = e.href;
				}
				return event;
			});
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
			};
		},
	);
}
