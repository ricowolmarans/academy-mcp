import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import * as api from "../canvas/resources.js";
import { ok, err, preview } from "../utils/response.js";
import { CanvasApiError } from "../canvas/errors.js";
import { getCanvasClient } from "../canvas/client.js";

function handle(e: unknown) {
  if (e instanceof CanvasApiError) return err(e.message, { status: e.status, endpoint: e.endpoint });
  return err(e instanceof Error ? e.message : String(e));
}

const Id = z.union([z.number(), z.string()]);

export function registerAllTools(server: McpServer) {
  server.registerTool("canvas_status", {
    description: "Verify Canvas connection. Token is never exposed.",
    inputSchema: z.object({}),
  }, async () => {
    try {
      const client = getCanvasClient();
      const self = await client.get<{ id: number; name: string }>("/users/self");
      return ok({ instance: client.instanceUrl, user_id: self.id, name: self.name, token: client.maskedToken }, "Canvas connection OK.");
    } catch (e) { return handle(e); }
  });

  server.registerTool("list_courses", {
    description: "List accessible Canvas courses. Filter by enrollment type, state, or search.",
    inputSchema: z.object({
      enrollment_type: z.enum(["teacher", "student", "ta", "observer", "designer"]).optional(),
      enrollment_state: z.enum(["active", "invited_or_pending", "completed"]).optional(),
      state: z.array(z.enum(["unpublished", "available", "completed", "deleted"])).optional(),
      search: z.string().optional(),
      include: z.array(z.string()).optional(),
    }),
  }, async (args) => {
    try {
      const courses = await api.listCourses(args);
      return ok(courses.map((c: any) => ({
        id: c.id, name: c.name, course_code: c.course_code,
        workflow_state: c.workflow_state, account_id: c.account_id,
      })), `Found ${courses.length} course(s).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("get_course", {
    description: "Get detailed information about a single course by ID.",
    inputSchema: z.object({ course_id: Id, include: z.array(z.string()).optional() }),
  }, async (args) => {
    try { return ok(await api.getCourse(args.course_id, args.include)); }
    catch (e) { return handle(e); }
  });

  server.registerTool("create_course", {
    description: "Create a new course. Requires account_id or CANVAS_ACCOUNT_ID. Defaults unpublished. Set confirm=true to apply.",
    inputSchema: z.object({
      name: z.string().min(1), course_code: z.string().optional(), account_id: z.number().optional(),
      start_at: z.string().optional(), end_at: z.string().optional(), syllabus_body: z.string().optional(),
      default_view: z.enum(["feed", "wiki", "modules", "assignments", "syllabus"]).optional(),
      is_public: z.boolean().optional(), offer: z.boolean().optional(), confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Create course", { name: args.name, offer: args.offer ?? false }, "Set confirm=true to create.");
      const course = await api.createCourse(args) as any;
      return ok(course, `Created course "${course.name}" (id=${course.id}).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("update_course", {
    description: "Update course settings. event=offer publishes, claim unpublishes, conclude concludes.",
    inputSchema: z.object({
      course_id: Id, name: z.string().optional(), course_code: z.string().optional(),
      start_at: z.string().nullable().optional(), end_at: z.string().nullable().optional(),
      syllabus_body: z.string().optional(),
      default_view: z.enum(["feed", "wiki", "modules", "assignments", "syllabus"]).optional(),
      is_public: z.boolean().optional(),
      event: z.enum(["offer", "claim", "conclude", "delete", "undelete"]).optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, confirm, ...params } = args;
      if (!confirm) return preview("Update course", { course_id, ...params }, "Set confirm=true to apply.");
      return ok(await api.updateCourse(course_id, params), `Updated course ${course_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("delete_course", {
    description: "Delete or conclude a course. ALWAYS requires confirm=true.",
    inputSchema: z.object({
      course_id: Id, event: z.enum(["delete", "conclude"]).default("delete"), confirm: z.boolean(),
    }),
  }, async (args) => {
    try {
      const existing = await api.getCourse(args.course_id) as any;
      if (!args.confirm) return preview(`${args.event} course`, { id: existing.id, name: existing.name }, "Set confirm=true.");
      return ok(await api.deleteCourse(args.course_id, args.event), `Course ${args.course_id} ${args.event}d.`);
    } catch (e) { return handle(e); }
  });

  // Modules
  server.registerTool("list_modules", {
    description: "List modules in a course. Set include_items=true for full structure.",
    inputSchema: z.object({ course_id: Id, include_items: z.boolean().optional() }),
  }, async (args) => {
    try {
      const modules = await api.listModules(args.course_id, args.include_items ?? false) as any[];
      return ok(modules, `Found ${modules.length} module(s).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("get_module", {
    description: "Get a module and its items.",
    inputSchema: z.object({ course_id: Id, module_id: Id }),
  }, async (args) => {
    try { return ok(await api.getModule(args.course_id, args.module_id, true)); }
    catch (e) { return handle(e); }
  });

  server.registerTool("create_module", {
    description: "Create a module. Set confirm=true to apply.",
    inputSchema: z.object({
      course_id: Id, name: z.string().min(1), position: z.number().optional(),
      unlock_at: z.string().optional(), require_sequential_progress: z.boolean().optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, confirm, ...params } = args;
      if (!confirm) return preview("Create module", { course_id, ...params }, "Set confirm=true.");
      const mod = await api.createModule(course_id, params) as any;
      return ok(mod, `Created module "${mod.name}" (id=${mod.id}).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("update_module", {
    description: "Update module name, position, or publish state.",
    inputSchema: z.object({
      course_id: Id, module_id: Id, name: z.string().optional(), position: z.number().optional(),
      published: z.boolean().optional(), confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, module_id, confirm, ...params } = args;
      if (!confirm) return preview("Update module", { course_id, module_id, ...params }, "Set confirm=true.");
      return ok(await api.updateModule(course_id, module_id, params), `Updated module ${module_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("delete_module", {
    description: "Delete a module. Requires confirm=true.",
    inputSchema: z.object({ course_id: Id, module_id: Id, confirm: z.boolean() }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Delete module", { module_id: args.module_id }, "Set confirm=true.");
      return ok(await api.deleteModule(args.course_id, args.module_id), `Deleted module ${args.module_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("create_module_item", {
    description: "Add item to module. Page: page_url; Assignment/Quiz: content_id; ExternalUrl: external_url; SubHeader: title.",
    inputSchema: z.object({
      course_id: Id, module_id: Id,
      type: z.enum(["File", "Page", "Discussion", "Assignment", "Quiz", "SubHeader", "ExternalUrl", "ExternalTool"]),
      title: z.string().optional(), content_id: z.number().optional(), page_url: z.string().optional(),
      external_url: z.string().optional(), position: z.number().optional(), published: z.boolean().optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, module_id, confirm, ...params } = args;
      if (!confirm) return preview("Create module item", { course_id, module_id, ...params }, "Set confirm=true.");
      const item = await api.createModuleItem(course_id, module_id, params) as any;
      return ok(item, `Created module item "${item.title}" (id=${item.id}).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("delete_module_item", {
    description: "Remove an item from a module. Requires confirm=true.",
    inputSchema: z.object({ course_id: Id, module_id: Id, item_id: Id, confirm: z.boolean() }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Delete module item", args, "Set confirm=true.");
      return ok(await api.deleteModuleItem(args.course_id, args.module_id, args.item_id), `Deleted item ${args.item_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("reorder_modules", {
    description: "Reorder modules by ordered list of module IDs.",
    inputSchema: z.object({ course_id: Id, module_ids: z.array(z.number()).min(1), confirm: z.boolean().optional() }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Reorder modules", { order: args.module_ids }, "Set confirm=true.");
      const results = [];
      for (let i = 0; i < args.module_ids.length; i++) {
        const mod = await api.updateModule(args.course_id, args.module_ids[i], { position: i + 1 }) as any;
        results.push({ id: mod.id, name: mod.name, position: mod.position });
      }
      return ok(results, `Reordered ${results.length} module(s).`);
    } catch (e) { return handle(e); }
  });

  // Assignments
  server.registerTool("list_assignments", {
    description: "List assignments in a course.",
    inputSchema: z.object({ course_id: Id, search: z.string().optional() }),
  }, async (args) => {
    try {
      const list = await api.listAssignments(args.course_id, { search: args.search }) as any[];
      return ok(list.map((a) => ({
        id: a.id, name: a.name, points_possible: a.points_possible, due_at: a.due_at, published: a.published,
      })), `Found ${list.length} assignment(s).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("get_assignment", {
    description: "Get full assignment details.",
    inputSchema: z.object({ course_id: Id, assignment_id: Id }),
  }, async (args) => {
    try { return ok(await api.getAssignment(args.course_id, args.assignment_id)); }
    catch (e) { return handle(e); }
  });

  server.registerTool("create_assignment", {
    description: "Create assignment (default unpublished). Set confirm=true.",
    inputSchema: z.object({
      course_id: Id, name: z.string().min(1), description: z.string().optional(),
      due_at: z.string().optional(), points_possible: z.number().optional(),
      grading_type: z.enum(["points", "percent", "letter_grade", "gpa_scale", "pass_fail", "not_graded"]).optional(),
      submission_types: z.array(z.string()).optional(), published: z.boolean().optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, confirm, ...params } = args;
      if (!confirm) return preview("Create assignment", { course_id, ...params }, "Set confirm=true.");
      const a = await api.createAssignment(course_id, params) as any;
      return ok(a, `Created assignment "${a.name}" (id=${a.id}).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("update_assignment", {
    description: "Update assignment including publish state.",
    inputSchema: z.object({
      course_id: Id, assignment_id: Id, name: z.string().optional(), description: z.string().optional(),
      due_at: z.string().nullable().optional(), points_possible: z.number().optional(),
      published: z.boolean().optional(), confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, assignment_id, confirm, ...params } = args;
      if (!confirm) return preview("Update assignment", { course_id, assignment_id, ...params }, "Set confirm=true.");
      return ok(await api.updateAssignment(course_id, assignment_id, params), `Updated assignment ${assignment_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("delete_assignment", {
    description: "Delete assignment. Requires confirm=true.",
    inputSchema: z.object({ course_id: Id, assignment_id: Id, confirm: z.boolean() }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Delete assignment", { assignment_id: args.assignment_id }, "Set confirm=true.");
      return ok(await api.deleteAssignment(args.course_id, args.assignment_id), `Deleted assignment ${args.assignment_id}.`);
    } catch (e) { return handle(e); }
  });

  // Pages
  server.registerTool("list_pages", {
    description: "List wiki pages in a course.",
    inputSchema: z.object({ course_id: Id, search: z.string().optional(), published: z.boolean().optional() }),
  }, async (args) => {
    try {
      const pages = await api.listPages(args.course_id, args) as any[];
      return ok(pages.map((p) => ({
        page_id: p.page_id, url: p.url, title: p.title, published: p.published,
      })), `Found ${pages.length} page(s).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("get_page", {
    description: "Get a page including HTML body.",
    inputSchema: z.object({ course_id: Id, page_url_or_id: z.string() }),
  }, async (args) => {
    try { return ok(await api.getPage(args.course_id, args.page_url_or_id)); }
    catch (e) { return handle(e); }
  });

  server.registerTool("create_page", {
    description: "Create wiki page (HTML body). Defaults unpublished. Set confirm=true.",
    inputSchema: z.object({
      course_id: Id, title: z.string().min(1), body: z.string().optional(),
      published: z.boolean().optional(), front_page: z.boolean().optional(), confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, confirm, ...params } = args;
      if (!confirm) return preview("Create page", { course_id, title: params.title }, "Set confirm=true.");
      const page = await api.createPage(course_id, params) as any;
      return ok(page, `Created page "${page.title}" (url=${page.url}).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("update_page", {
    description: "Update page title, body, or publish state.",
    inputSchema: z.object({
      course_id: Id, page_url_or_id: z.string(), title: z.string().optional(),
      body: z.string().optional(), published: z.boolean().optional(), front_page: z.boolean().optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, page_url_or_id, confirm, ...params } = args;
      if (!confirm) return preview("Update page", { course_id, page_url_or_id, ...params }, "Set confirm=true.");
      return ok(await api.updatePage(course_id, page_url_or_id, params), `Updated page ${page_url_or_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("publish_page", {
    description: "Publish or unpublish a page. Publish requires confirm=true.",
    inputSchema: z.object({
      course_id: Id, page_url_or_id: z.string(), published: z.boolean(), confirm: z.boolean(),
    }),
  }, async (args) => {
    try {
      if (args.published && !args.confirm) return preview("Publish page", { page: args.page_url_or_id }, "Set confirm=true.");
      const page = await api.updatePage(args.course_id, args.page_url_or_id, { published: args.published });
      return ok(page, `Page is now ${args.published ? "published" : "unpublished"}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("delete_page", {
    description: "Delete a wiki page. Requires confirm=true.",
    inputSchema: z.object({ course_id: Id, page_url_or_id: z.string(), confirm: z.boolean() }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Delete page", { page: args.page_url_or_id }, "Set confirm=true.");
      return ok(await api.deletePage(args.course_id, args.page_url_or_id), `Deleted page ${args.page_url_or_id}.`);
    } catch (e) { return handle(e); }
  });

  // Quizzes
  server.registerTool("list_quizzes", {
    description: "List classic quizzes in a course.",
    inputSchema: z.object({ course_id: Id }),
  }, async (args) => {
    try {
      const quizzes = await api.listQuizzes(args.course_id) as any[];
      return ok(quizzes.map((q) => ({
        id: q.id, title: q.title, published: q.published, question_count: q.question_count,
      })), `Found ${quizzes.length} quiz(zes).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("get_quiz", {
    description: "Get quiz details.",
    inputSchema: z.object({ course_id: Id, quiz_id: Id }),
  }, async (args) => {
    try { return ok(await api.getQuiz(args.course_id, args.quiz_id)); }
    catch (e) { return handle(e); }
  });

  server.registerTool("create_quiz", {
    description: "Create classic quiz (default unpublished). Add questions with create_quiz_question.",
    inputSchema: z.object({
      course_id: Id, title: z.string().min(1), description: z.string().optional(),
      quiz_type: z.enum(["practice_quiz", "assignment", "graded_survey", "survey"]).optional(),
      time_limit: z.number().optional(), published: z.boolean().optional(), due_at: z.string().optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, confirm, ...params } = args;
      if (!confirm) return preview("Create quiz", { course_id, ...params }, "Set confirm=true.");
      const quiz = await api.createQuiz(course_id, params) as any;
      return ok(quiz, `Created quiz "${quiz.title}" (id=${quiz.id}).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("update_quiz", {
    description: "Update quiz settings or publish state.",
    inputSchema: z.object({
      course_id: Id, quiz_id: Id, title: z.string().optional(), description: z.string().optional(),
      published: z.boolean().optional(), time_limit: z.number().nullable().optional(), confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, quiz_id, confirm, ...params } = args;
      if (!confirm) return preview("Update quiz", { course_id, quiz_id, ...params }, "Set confirm=true.");
      return ok(await api.updateQuiz(course_id, quiz_id, params), `Updated quiz ${quiz_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("delete_quiz", {
    description: "Delete a quiz. Requires confirm=true.",
    inputSchema: z.object({ course_id: Id, quiz_id: Id, confirm: z.boolean() }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Delete quiz", { quiz_id: args.quiz_id }, "Set confirm=true.");
      return ok(await api.deleteQuiz(args.course_id, args.quiz_id), `Deleted quiz ${args.quiz_id}.`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("list_quiz_questions", {
    description: "List questions for a quiz.",
    inputSchema: z.object({ course_id: Id, quiz_id: Id }),
  }, async (args) => {
    try {
      const qs = await api.listQuizQuestions(args.course_id, args.quiz_id) as any[];
      return ok(qs, `Found ${qs.length} question(s).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("create_quiz_question", {
    description: "Add a question to a classic quiz. For multiple_choice use answers with answer_weight 100 for correct.",
    inputSchema: z.object({
      course_id: Id, quiz_id: Id, question_name: z.string().optional(), question_text: z.string().min(1),
      question_type: z.enum([
        "multiple_choice_question", "true_false_question", "short_answer_question",
        "essay_question", "numerical_question", "text_only_question", "multiple_answers_question",
      ]),
      points_possible: z.number().optional(),
      answers: z.array(z.object({ answer_text: z.string().optional(), answer_weight: z.number().optional() })).optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { course_id, quiz_id, confirm, ...params } = args;
      if (!confirm) return preview("Create quiz question", { type: params.question_type }, "Set confirm=true.");
      const q = await api.createQuizQuestion(course_id, quiz_id, params) as any;
      return ok(q, `Created question id=${q.id}.`);
    } catch (e) { return handle(e); }
  });

  // Rubrics
  server.registerTool("list_rubrics", {
    description: "List rubrics for a course.",
    inputSchema: z.object({ course_id: Id }),
  }, async (args) => {
    try {
      const rubrics = await api.listRubrics(args.course_id) as any[];
      return ok(rubrics, `Found ${rubrics.length} rubric(s).`);
    } catch (e) { return handle(e); }
  });

  server.registerTool("get_rubric", {
    description: "Get a rubric by ID.",
    inputSchema: z.object({ course_id: Id, rubric_id: Id }),
  }, async (args) => {
    try { return ok(await api.getRubric(args.course_id, args.rubric_id)); }
    catch (e) { return handle(e); }
  });

  server.registerTool("create_rubric", {
    description: "Create a course-level rubric. Set confirm=true.",
    inputSchema: z.object({
      course_id: Id, title: z.string().min(1), free_form_criterion_comments: z.boolean().optional(),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Create rubric", { title: args.title }, "Set confirm=true.");
      return ok(await api.createRubric(args.course_id, args), "Created rubric.");
    } catch (e) { return handle(e); }
  });

  server.registerTool("delete_rubric", {
    description: "Delete a rubric. Requires confirm=true.",
    inputSchema: z.object({ course_id: Id, rubric_id: Id, confirm: z.boolean() }),
  }, async (args) => {
    try {
      if (!args.confirm) return preview("Delete rubric", { rubric_id: args.rubric_id }, "Set confirm=true.");
      return ok(await api.deleteRubric(args.course_id, args.rubric_id), `Deleted rubric ${args.rubric_id}.`);
    } catch (e) { return handle(e); }
  });

  // Course building
  server.registerTool("build_course_structure", {
    description: "Create multiple modules with pages/assignments/subheaders in one call. AI supplies titles and HTML. Requires confirm=true.",
    inputSchema: z.object({
      course_id: Id,
      modules: z.array(z.object({
        name: z.string(),
        items: z.array(z.object({
          type: z.enum(["Page", "Assignment", "SubHeader", "ExternalUrl"]),
          title: z.string(), body: z.string().optional(), points_possible: z.number().optional(),
          external_url: z.string().optional(), published: z.boolean().optional(),
        })).optional(),
      })).min(1),
      confirm: z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      if (!args.confirm) {
        return preview("Build course structure", {
          course_id: args.course_id,
          modules: args.modules.map((m) => m.name),
        }, "Set confirm=true.");
      }
      const results: unknown[] = [];
      for (const modSpec of args.modules) {
        const mod = await api.createModule(args.course_id, { name: modSpec.name }) as any;
        const createdItems: unknown[] = [];
        for (const item of modSpec.items ?? []) {
          if (item.type === "Page") {
            const page = await api.createPage(args.course_id, {
              title: item.title, body: item.body ?? "", published: item.published ?? false,
            }) as any;
            const mi = await api.createModuleItem(args.course_id, mod.id, {
              type: "Page", title: item.title, page_url: page.url, published: item.published ?? false,
            });
            createdItems.push({ page, module_item: mi });
          } else if (item.type === "Assignment") {
            const a = await api.createAssignment(args.course_id, {
              name: item.title, description: item.body,
              points_possible: item.points_possible ?? 0, published: item.published ?? false,
            }) as any;
            const mi = await api.createModuleItem(args.course_id, mod.id, {
              type: "Assignment", title: item.title, content_id: a.id, published: item.published ?? false,
            });
            createdItems.push({ assignment: a, module_item: mi });
          } else if (item.type === "SubHeader") {
            createdItems.push({
              module_item: await api.createModuleItem(args.course_id, mod.id, {
                type: "SubHeader", title: item.title,
              }),
            });
          } else if (item.type === "ExternalUrl") {
            createdItems.push({
              module_item: await api.createModuleItem(args.course_id, mod.id, {
                type: "ExternalUrl", title: item.title, external_url: item.external_url,
                published: item.published ?? false,
              }),
            });
          }
        }
        results.push({ module: mod, items: createdItems });
      }
      return ok(results, `Built ${results.length} module(s) with content.`);
    } catch (e) { return handle(e); }
  });
}
