import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    return await ctx.db.query("sessions").order("desc").collect();
  },
});

export const getByProject = query({
  args: { projectName: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .filter((q) => q.eq(q.field("projectName"), args.projectName))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: {
    projectName: v.string(),
    startTime: v.number(),
    duration: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("sessions", args);
  },
});
