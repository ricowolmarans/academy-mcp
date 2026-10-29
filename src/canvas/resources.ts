import { getCanvasClient } from "./client.js";
import { getConfig } from "../utils/config.js";

type Id = number | string;

export async function listCourses(opts?: {
  enrollment_type?: string; enrollment_state?: string; state?: string[];
  search?: string; include?: string[];
}) {
  const client = getCanvasClient();
  const query: Record<string, unknown> = { per_page: 50 };
  if (opts?.enrollment_type) query.enrollment_type = opts.enrollment_type;
  if (opts?.enrollment_state) query.enrollment_state = opts.enrollment_state;
  if (opts?.state?.length) query["state[]"] = opts.state;
  if (opts?.include?.length) query["include[]"] = opts.include;
  let courses = await client.get<any[]>("/courses", query as never, 20);
  if (opts?.search) {
    const q = opts.search.toLowerCase();
    courses = courses.filter((c: any) =>
      c.name?.toLowerCase().includes(q) || c.course_code?.toLowerCase().includes(q) || String(c.id).includes(q)
    );
  }
  return courses;
}

export async function getCourse(courseId: Id, include?: string[]) {
  return getCanvasClient().get(`/courses/${courseId}`, { "include[]": include });
}

export async function createCourse(params: {
  name: string; course_code?: string; account_id?: number; start_at?: string;
  end_at?: string; syllabus_body?: string; default_view?: string; is_public?: boolean; offer?: boolean;
}) {
  const cfg = getConfig();
  const accountId = params.account_id ?? cfg.CANVAS_ACCOUNT_ID;
  if (!accountId) throw new Error("account_id is required. Set CANVAS_ACCOUNT_ID or pass account_id.");
  return getCanvasClient().post(`/accounts/${accountId}/courses`, {
    course: {
      name: params.name, course_code: params.course_code ?? params.name,
      start_at: params.start_at, end_at: params.end_at, syllabus_body: params.syllabus_body,
      default_view: params.default_view ?? "modules", is_public: params.is_public ?? false,
    },
    offer: params.offer ?? false,
  });
}

export async function updateCourse(courseId: Id, params: Record<string, unknown>) {
  const { event, ...courseFields } = params;
  const body: Record<string, unknown> = { course: courseFields };
  if (event) body.event = event;
  return getCanvasClient().put(`/courses/${courseId}`, body);
}

export async function deleteCourse(courseId: Id, event: "delete" | "conclude" = "delete") {
  return getCanvasClient().delete(`/courses/${courseId}`, { event });
}

export async function listModules(courseId: Id, includeItems = false) {
  const query: Record<string, unknown> = { per_page: 50 };
  if (includeItems) query["include[]"] = ["items", "content_details"];
  return getCanvasClient().get(`/courses/${courseId}/modules`, query as never, 20);
}

export async function getModule(courseId: Id, moduleId: Id, includeItems = true) {
  const query: Record<string, unknown> = {};
  if (includeItems) query["include[]"] = ["items", "content_details"];
  return getCanvasClient().get(`/courses/${courseId}/modules/${moduleId}`, query as never);
}

export async function createModule(courseId: Id, params: Record<string, unknown>) {
  return getCanvasClient().post(`/courses/${courseId}/modules`, { module: params });
}

export async function updateModule(courseId: Id, moduleId: Id, params: Record<string, unknown>) {
  return getCanvasClient().put(`/courses/${courseId}/modules/${moduleId}`, { module: params });
}

export async function deleteModule(courseId: Id, moduleId: Id) {
  return getCanvasClient().delete(`/courses/${courseId}/modules/${moduleId}`);
}

export async function listModuleItems(courseId: Id, moduleId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/modules/${moduleId}/items`, { per_page: 50 }, 20);
}

export async function createModuleItem(courseId: Id, moduleId: Id, params: Record<string, unknown>) {
  return getCanvasClient().post(`/courses/${courseId}/modules/${moduleId}/items`, { module_item: params });
}

export async function updateModuleItem(courseId: Id, moduleId: Id, itemId: Id, params: Record<string, unknown>) {
  return getCanvasClient().put(`/courses/${courseId}/modules/${moduleId}/items/${itemId}`, { module_item: params });
}

export async function deleteModuleItem(courseId: Id, moduleId: Id, itemId: Id) {
  return getCanvasClient().delete(`/courses/${courseId}/modules/${moduleId}/items/${itemId}`);
}

export async function listAssignments(courseId: Id, opts?: { search?: string; include?: string[] }) {
  const query: Record<string, unknown> = { per_page: 50 };
  if (opts?.include?.length) query["include[]"] = opts.include;
  if (opts?.search) query.search_term = opts.search;
  return getCanvasClient().get(`/courses/${courseId}/assignments`, query as never, 20);
}

export async function getAssignment(courseId: Id, assignmentId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/assignments/${assignmentId}`);
}

export async function createAssignment(courseId: Id, params: Record<string, unknown>) {
  return getCanvasClient().post(`/courses/${courseId}/assignments`, {
    assignment: { submission_types: ["online_text_entry"], published: false, ...params },
  });
}

export async function updateAssignment(courseId: Id, assignmentId: Id, params: Record<string, unknown>) {
  return getCanvasClient().put(`/courses/${courseId}/assignments/${assignmentId}`, { assignment: params });
}

export async function deleteAssignment(courseId: Id, assignmentId: Id) {
  return getCanvasClient().delete(`/courses/${courseId}/assignments/${assignmentId}`);
}

export async function listAssignmentGroups(courseId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/assignment_groups`, { per_page: 50 }, 10);
}

export async function listPages(courseId: Id, opts?: { search?: string; published?: boolean }) {
  const query: Record<string, unknown> = { per_page: 50 };
  if (opts?.search) query.search_term = opts.search;
  if (opts?.published !== undefined) query.published = opts.published;
  return getCanvasClient().get(`/courses/${courseId}/pages`, query as never, 20);
}

export async function getPage(courseId: Id, pageUrlOrId: string) {
  return getCanvasClient().get(`/courses/${courseId}/pages/${encodeURIComponent(pageUrlOrId)}`);
}

export async function createPage(courseId: Id, params: {
  title: string; body?: string; published?: boolean; front_page?: boolean; editing_roles?: string;
}) {
  return getCanvasClient().post(`/courses/${courseId}/pages`, {
    wiki_page: {
      title: params.title, body: params.body ?? "", published: params.published ?? false,
      front_page: params.front_page ?? false, editing_roles: params.editing_roles ?? "teachers",
    },
  });
}

export async function updatePage(courseId: Id, pageUrlOrId: string, params: Record<string, unknown>) {
  return getCanvasClient().put(`/courses/${courseId}/pages/${encodeURIComponent(pageUrlOrId)}`, { wiki_page: params });
}

export async function deletePage(courseId: Id, pageUrlOrId: string) {
  return getCanvasClient().delete(`/courses/${courseId}/pages/${encodeURIComponent(pageUrlOrId)}`);
}

export async function listQuizzes(courseId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/quizzes`, { per_page: 50 }, 20);
}

export async function getQuiz(courseId: Id, quizId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/quizzes/${quizId}`);
}

export async function createQuiz(courseId: Id, params: Record<string, unknown>) {
  return getCanvasClient().post(`/courses/${courseId}/quizzes`, {
    quiz: { quiz_type: "assignment", published: false, ...params },
  });
}

export async function updateQuiz(courseId: Id, quizId: Id, params: Record<string, unknown>) {
  return getCanvasClient().put(`/courses/${courseId}/quizzes/${quizId}`, { quiz: params });
}

export async function deleteQuiz(courseId: Id, quizId: Id) {
  return getCanvasClient().delete(`/courses/${courseId}/quizzes/${quizId}`);
}

export async function listQuizQuestions(courseId: Id, quizId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/quizzes/${quizId}/questions`, { per_page: 50 }, 20);
}

export async function createQuizQuestion(courseId: Id, quizId: Id, params: Record<string, unknown>) {
  return getCanvasClient().post(`/courses/${courseId}/quizzes/${quizId}/questions`, { question: params });
}

export async function listRubrics(courseId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/rubrics`, { per_page: 50 }, 10);
}

export async function getRubric(courseId: Id, rubricId: Id) {
  return getCanvasClient().get(`/courses/${courseId}/rubrics/${rubricId}`);
}

export async function createRubric(courseId: Id, params: { title: string; free_form_criterion_comments?: boolean }) {
  return getCanvasClient().post(`/courses/${courseId}/rubrics`, {
    rubric: { title: params.title, free_form_criterion_comments: params.free_form_criterion_comments ?? false },
    rubric_association: { association_id: courseId, association_type: "Course", purpose: "bookmark" },
  });
}

export async function updateRubric(courseId: Id, rubricId: Id, params: Record<string, unknown>) {
  return getCanvasClient().put(`/courses/${courseId}/rubrics/${rubricId}`, { rubric: params });
}

export async function deleteRubric(courseId: Id, rubricId: Id) {
  return getCanvasClient().delete(`/courses/${courseId}/rubrics/${rubricId}`);
}
