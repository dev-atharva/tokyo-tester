let currentProjectId: string | null = null;

export function setCurrentSessionProjectId(projectId: string | null) {
  currentProjectId = projectId;
}

export function getCurrentSessionProjectId() {
  return currentProjectId;
}
