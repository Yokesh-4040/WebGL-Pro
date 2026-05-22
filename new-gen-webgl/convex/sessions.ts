import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    return await ctx.db.query("sessions").collect();
  },
});

export const add = mutation({
  args: {
    projectName: v.string(),
    startTime: v.number(),
    duration: v.number(),
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

    return await ctx.db.insert("sessions", args);
  },
});
