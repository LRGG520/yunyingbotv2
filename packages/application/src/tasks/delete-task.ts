import type { DatabaseSync } from "node:sqlite";

export const deleteTask = (db: DatabaseSync, taskId: string) => {
  const task = db.prepare(`SELECT id, project_id FROM analysis_tasks WHERE id = ?`).get(taskId) as
    | { id: string; project_id: string }
    | undefined;

  if (!task) {
    return null;
  }

  db.exec("BEGIN");

  try {
    db.prepare(`DELETE FROM review_records WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM report_versions WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM collection_runs WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM factors WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM dimensions WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM reports WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM evidences WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM onchain_lp_candidates WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM onchain_source_contexts WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM community_source_contexts WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM sources WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM task_inputs WHERE task_id = ?`).run(taskId);
    db.prepare(`DELETE FROM analysis_tasks WHERE id = ?`).run(taskId);

    const remainingTaskCount = db
      .prepare(`SELECT COUNT(*) as count FROM analysis_tasks WHERE project_id = ?`)
      .get(task.project_id) as { count: number };

    let deletedProjectId: string | null = null;
    if (remainingTaskCount.count === 0) {
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(task.project_id);
      deletedProjectId = task.project_id;
    }

    db.exec("COMMIT");

    return {
      taskId,
      deleted: true,
      deletedProjectId
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};
