import { put, request } from "./core";

export interface CronJob {
  id: string;
  source: "crontab" | "launchd";
  label: string | null;
  schedule: string;
  scheduleHuman: string;
  command: string;
  enabled: boolean;
  nextRun: string | null;
  plistPath: string | null;
  assignedAgentId: string | null;
  description: string | null;
}

export interface CronJobsResponse {
  ok: boolean;
  jobs: CronJob[];
  refreshedAt: number;
  platform: "darwin" | "linux" | "unknown";
}

export interface PatrolAssignments {
  assignments: Record<string, string>;
}

export interface JobDescriptions {
  descriptions: Record<string, string>;
}

export async function getCronJobs(): Promise<CronJobsResponse> {
  return request<CronJobsResponse>("/api/cron/jobs");
}

export async function getPatrolAssignments(): Promise<PatrolAssignments> {
  return request<PatrolAssignments>("/api/cron/assignments");
}

export async function savePatrolAssignments(assignments: Record<string, string>): Promise<{ ok: boolean }> {
  return put<{ ok: boolean }>("/api/cron/assignments", { assignments });
}

export async function getJobDescriptions(): Promise<JobDescriptions> {
  return request<JobDescriptions>("/api/cron/descriptions");
}

export async function saveJobDescriptions(descriptions: Record<string, string>): Promise<{ ok: boolean }> {
  return put<{ ok: boolean }>("/api/cron/descriptions", { descriptions });
}
