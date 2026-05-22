import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
  },
});

export const add = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const nameTrimmed = args.name.trim();
    if (!nameTrimmed) throw new Error("Project name cannot be empty");

    const existing = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("name"), nameTrimmed))
      .first();
    
    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("projects", {
      name: nameTrimmed,
      description: args.description,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
