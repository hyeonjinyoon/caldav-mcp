import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { z } from "zod";
import { createCalendarUrlSchema } from "../validation.js";

type ListEventsInput = {
	start: string;
	end: string;
	calendarUrl: string;
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
				"List all events between start and end date in the calendar specified by its URL",
			inputSchema: {
				start: dateString,
				end: dateString,
				calendarUrl: createCalendarUrlSchema(baseUrl),
			},
		},
		async (args: ListEventsInput) => {
			const { calendarUrl, start, end } = args;
			const options = {
				start: new Date(start),
				end: new Date(end),
			};
			const allEvents = await client.getEvents(calendarUrl, options);
			const data = allEvents.map((e) => ({
				uid: e.uid,
				summary: e.summary,
				start: e.start,
				end: e.end,
				description: e.description,
				location: e.location,
				etag: e.etag,
				href: e.href,
				recurrenceRule: e.recurrenceRule,
			}));
			return {
				content: [{ type: "text", text: JSON.stringify(data) }],
			};
		},
	);
}
