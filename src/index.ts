#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CalDAVClient } from "ts-caldav";

import { registerCreateEvent } from "./tools/create-event.js";
import { registerDeleteEvent } from "./tools/delete-event.js";
import { registerListCalendars } from "./tools/list-calendars.js";
import { registerListEvents } from "./tools/list-events.js";

const server = new McpServer({
	name: "caldav-mcp",
	version: "0.1.0",
});

async function main() {
	const baseUrl = process.env.CALDAV_BASE_URL;
	const username = process.env.CALDAV_USERNAME;
	const password = process.env.CALDAV_PASSWORD;

	if (!baseUrl || !username || !password) {
		const missing = [
			!baseUrl && "CALDAV_BASE_URL",
			!username && "CALDAV_USERNAME",
			!password && "CALDAV_PASSWORD",
		].filter(Boolean);
		console.error(
			`Missing required environment variables: ${missing.join(", ")}`,
		);
		process.exit(1);
	}

	if (!baseUrl.startsWith("https://")) {
		console.error(
			"CALDAV_BASE_URL must use HTTPS to protect credentials in transit",
		);
		process.exit(1);
	}

	const client = await CalDAVClient.create({
		baseUrl,
		auth: {
			type: "basic",
			username,
			password,
		},
	});

	// Test connection on startup
	try {
		await client.getCalendars();
	} catch {
		console.error(
			"Failed to connect to CalDAV server. Please check your credentials and server URL.",
		);
		process.exit(1);
	}

	registerCreateEvent(client, server, baseUrl);
	registerListEvents(client, server, baseUrl);
	registerDeleteEvent(client, server, baseUrl);
	registerListCalendars(client, server);

	// Start receiving messages on stdin and sending messages on stdout
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main();
