import { request } from "./core";

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
}

export interface CronJobsResponse {
  ok: boolean;
  jobs: CronJob[];
  refreshedAt: number;
  platform: "darwin" | "linux" | "unknown";
}

export async function getCronJobs(): Promise<CronJobsResponse> {
  return request<CronJobsResponse>("/api/cron/jobs");
}
