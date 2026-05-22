import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// CORS Headers utility
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

// CORS Options Preflight Handler
const handleOptions = httpAction(async () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
});

// Route for getting a secure upload URL
http.route({
  path: "/api/upload-url",
  method: "POST",
  handler: httpAction(async (ctx) => {
    try {
      const uploadUrl = await ctx.runMutation(api.bug_reports.generateUploadUrl);
      return new Response(JSON.stringify({ uploadUrl }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Failed to generate upload URL" }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }),
});

http.route({
  path: "/api/upload-url",
  method: "OPTIONS",
  handler: handleOptions,
});

// Route for logging sessions
http.route({
  path: "/api/sessions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.projectName || typeof body.startTime !== "number" || typeof body.duration !== "number") {
        return new Response(JSON.stringify({ error: "Invalid payload fields" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      await ctx.runMutation(api.sessions.add, {
        projectName: body.projectName,
        startTime: body.startTime,
        duration: body.duration,
      });

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Failed to log session" }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }),
});

http.route({
  path: "/api/sessions",
  method: "OPTIONS",
  handler: handleOptions,
});

// Route for submitting bug reports
http.route({
  path: "/api/bug-reports",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      if (!body.projectName || !body.title || !body.description) {
        return new Response(JSON.stringify({ error: "Required fields (projectName, title, description) missing" }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const bugId = await ctx.runMutation(api.bug_reports.add, {
        projectName: body.projectName,
        title: body.title,
        description: body.description,
        category: body.category || "Other",
        severity: body.severity || "Medium",
        screenshotId: body.screenshotId || undefined,
        videoId: body.videoId || undefined,
        consoleLogs: body.consoleLogs || undefined,
        timestamp: body.timestamp || Date.now(),
      });

      return new Response(JSON.stringify({ success: true, bugId }), {
        status: 200,
        headers: corsHeaders,
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: e.message || "Failed to log bug report" }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }),
});

http.route({
  path: "/api/bug-reports",
  method: "OPTIONS",
  handler: handleOptions,
});

export default http;
