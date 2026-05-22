import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    const reports = await ctx.db.query("bugReports").order("desc").collect();
    
    // Resolve URLs for screenshots and videos
    return await Promise.all(
      reports.map(async (r) => {
        const screenshotUrl = r.screenshotId
          ? await ctx.storage.getUrl(r.screenshotId)
          : null;
        const videoUrl = r.videoId
          ? await ctx.storage.getUrl(r.videoId)
          : null;
        return {
          ...r,
          screenshotUrl,
          videoUrl,
        };
      })
    );
  },
});

export const getByProject = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    const reports = await ctx.db
      .query("bugReports")
      .filter((q) => q.eq(q.field("projectName"), args.projectName))
      .order("desc")
      .collect();

    return await Promise.all(
      reports.map(async (r) => {
        const screenshotUrl = r.screenshotId
          ? await ctx.storage.getUrl(r.screenshotId)
          : null;
        const videoUrl = r.videoId
          ? await ctx.storage.getUrl(r.videoId)
          : null;
        return {
          ...r,
          screenshotUrl,
          videoUrl,
        };
      })
    );
  },
});

export const generateUploadUrl = mutation({
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
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
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("bugReports", args);
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    return await ctx.storage.getUrl(args.storageId);
  },
});
