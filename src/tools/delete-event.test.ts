import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CalDAVClient } from "ts-caldav";
import { describe, expect, test, vi } from "vitest";
import type { CalDAVHttp } from "../caldav-http.js";
import { registerDeleteEvent } from "./delete-event.js";

type ToolHandler = (params: {
	calendarUrl: string;
	uid: string;
	etag?: string;
	recurrenceDate?: string;
}) => Promise<{ content: { type: string; text: string }[] }>;

function setupTool(
	mockClient: Partial<CalDAVClient>,
	mockCaldavHttp: Partial<CalDAVHttp>,
) {
	let toolHandler: ToolHandler | null = null;
	const server = new McpServer({ name: "test-server", version: "0.1.0" });

	const originalRegisterTool = server.registerTool.bind(server);
	server.registerTool = vi.fn(
		(name: string, config: unknown, handler: ToolHandler) => {
			if (name === "delete-event") {
				toolHandler = handler;
			}
			return originalRegisterTool(name, config, handler);
		},
	) as typeof server.registerTool;

	registerDeleteEvent(
		mockClient as CalDAVClient,
		server,
		"https://example.com/dav",
		mockCaldavHttp as CalDAVHttp,
	);

	return toolHandler as ToolHandler;
}

const RECURRING_ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:recurring-123
DTSTART:20250301T190000Z
DTEND:20250301T200000Z
SUMMARY:저녁
RRULE:FREQ=DAILY
END:VEVENT
END:VCALENDAR`;

describe("registerDeleteEvent", () => {
	test("deletes entire event when no recurrenceDate provided", async () => {
		const mockClient = {
			deleteEvent: vi.fn().mockResolvedValue(undefined),
		};
		const mockCaldavHttp = {};

		const handler = setupTool(mockClient, mockCaldavHttp);
		const result = await handler({
			calendarUrl: "https://example.com/f/test-calendar/",
			uid: "event-123",
		});

		expect(result.content[0].text).toBe("Event deleted");
		expect(mockClient.deleteEvent).toHaveBeenCalledWith(
			"https://example.com/f/test-calendar/",
			"event-123",
			undefined,
		);
	});

	test("passes etag to deleteEvent when provided", async () => {
		const mockClient = {
			deleteEvent: vi.fn().mockResolvedValue(undefined),
		};
		const mockCaldavHttp = {};

		const handler = setupTool(mockClient, mockCaldavHttp);
		await handler({
			calendarUrl: "https://example.com/f/test-calendar/",
			uid: "event-123",
			etag: '"etag-abc"',
		});

		expect(mockClient.deleteEvent).toHaveBeenCalledWith(
			"https://example.com/f/test-calendar/",
			"event-123",
			'"etag-abc"',
		);
	});

	test("deletes single recurring instance via STATUS:CANCELLED when recurrenceDate provided", async () => {
		const mockClient = {
			deleteEvent: vi.fn(),
		};
		const mockCaldavHttp = {
			getICS: vi.fn().mockResolvedValue({
				icsData: RECURRING_ICS,
				etag: '"etag-456"',
			}),
			putICS: vi.fn().mockResolvedValue('"new-etag"'),
		};

		const handler = setupTool(mockClient, mockCaldavHttp);
		const result = await handler({
			calendarUrl: "https://example.com/f/test-calendar/",
			uid: "recurring-123",
			recurrenceDate: "2025-03-05T19:00:00Z",
		});

		expect(result.content[0].text).toBe("Recurring event instance deleted");
		expect(mockClient.deleteEvent).not.toHaveBeenCalled();
		expect(mockCaldavHttp.getICS).toHaveBeenCalledWith(
			"https://example.com/f/test-calendar/recurring-123.ics",
		);
		expect(mockCaldavHttp.putICS).toHaveBeenCalledWith(
			"https://example.com/f/test-calendar/recurring-123.ics",
			expect.stringContaining("STATUS:CANCELLED"),
			'"etag-456"',
		);
	});

	test("always uses freshly fetched etag for recurring instance deletion", async () => {
		const mockClient = { deleteEvent: vi.fn() };
		const mockCaldavHttp = {
			getICS: vi.fn().mockResolvedValue({
				icsData: RECURRING_ICS,
				etag: '"fetched-etag"',
			}),
			putICS: vi.fn().mockResolvedValue('"new-etag"'),
		};

		const handler = setupTool(mockClient, mockCaldavHttp);
		await handler({
			calendarUrl: "https://example.com/f/test-calendar/",
			uid: "recurring-123",
			recurrenceDate: "2025-03-05T19:00:00Z",
			etag: '"stale-user-etag"',
		});

		expect(mockCaldavHttp.putICS).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(String),
			'"fetched-etag"',
		);
	});
});
