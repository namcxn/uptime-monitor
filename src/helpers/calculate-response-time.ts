import dayjs from "dayjs";
import { Downtimes } from "../interfaces";
import { getConfig } from "./config";
import { getOctokit } from "./github";

/** Calculate the average of some numbers */
const avg = (array: number[]) => (array.length ? array.reduce((a, b) => a + b) / array.length : 0);

export const getResponseTimeForSite = async (
  slug: string
): Promise<Downtimes & { currentStatus: "up" | "down" | "degraded" }> => {
  let [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  const octokit = await getOctokit();
  const config = await getConfig();

  const history = await octokit.repos.listCommits({
    owner,
    repo,
    path: `history/${slug}.yml`,
    per_page: 100,
  });
  const responseTimes: [string, number][] = history.data
    .filter(
      (item) =>
        item.commit.message.includes(" in ") &&
        Number(item.commit.message.split(" in ")[1].split("ms")[0].trim()) !== 0 &&
        !isNaN(Number(item.commit.message.split(" in ")[1].split("ms")[0].trim()))
    )
    /**
     * Parse the commit message
     * @example "🟥 Broken Site is down (500 in 321 ms) [skip ci] [upptime]"
     * @returns [Date, 321] where Date is the commit date
     */
    .map(
      (item) =>
        [
          item.commit.author.date,
          parseInt(item.commit.message.split(" in ")[1].split("ms")[0].trim()),
        ] as [string, number]
    )
    .filter((item) => item[1] && !isNaN(item[1]));

  const daySum: number[] = responseTimes
    .filter((i) => dayjs(i[0]).isAfter(dayjs().subtract(1, "day")))
    .map((i) => i[1]);
  const weekSum: number[] = responseTimes
    .filter((i) => dayjs(i[0]).isAfter(dayjs().subtract(1, "week")))
    .map((i) => i[1]);
  const monthSum: number[] = responseTimes
    .filter((i) => dayjs(i[0]).isAfter(dayjs().subtract(1, "month")))
    .map((i) => i[1]);
  const yearSum: number[] = responseTimes
    .filter((i) => dayjs(i[0]).isAfter(dayjs().subtract(1, "year")))
    .map((i) => i[1]);
  const allSum: number[] = responseTimes.map((i) => i[1]);
  console.log("weekSum", weekSum, avg(weekSum));

  // Current status is "up", "down", or "degraded" based on the emoji prefix of the commit message
  const currentStatus: "up" | "down" | "degraded" = history.data[0].commit.message
    .split(" ")[0]
    .includes(config.commitPrefixStatusUp || "🟩")
    ? "up"
    : history.data[0].commit.message
        .split(" ")[0]
        .includes(config.commitPrefixStatusDegraded || "🟨")
    ? "degraded"
    : "down";

  return {
    day: avg(daySum) || 0,
    week: avg(weekSum) || 0,
    month: avg(monthSum) || 0,
    year: avg(yearSum) || 0,
    all: avg(allSum) || 0,
    currentStatus,
  };
};
