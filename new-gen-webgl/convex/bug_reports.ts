import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    const bugs = await ctx.db.query("bugReports").collect();
    return await Promise.all(
      bugs.map(async (bug) => {
        const screenshotUrl = bug.screenshotId
          ? await ctx.storage.getUrl(bug.screenshotId)
          : null;
        const videoUrl = bug.videoId
          ? await ctx.storage.getUrl(bug.videoId)
          : null;
        return {
          ...bug,
          screenshotUrl,
          videoUrl,
        };
      })
    );
  },
});

export const add = mutation({
  args: {
    projectName: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.string(),
    severity: v.string(),
    screenshotId: v.optional(v.id("_storage")),
    videoId: v.optional(v.id("_storage")),
    consoleLogs: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    // Check if project exists, if not, create it
    const project = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("name"), args.projectName))
      .first();

    if (!project) {
      await ctx.db.insert("projects", {
        name: args.projectName,
        createdAt: Date.now(),
      });
    }

    return await ctx.db.insert("bugReports", args);
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});
