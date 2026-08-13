import { asinChanges, dailySales, monthlySales, products, uploadHistory } from "../mocks/dashboardData";

const wait = (ms = 420) => new Promise((resolve) => setTimeout(resolve, ms));

export async function getDashboardData() {
  await wait();
  return { products, monthlySales, dailySales };
}

export async function getTrackingData() {
  await wait(300);
  return { products, asinChanges };
}

export async function getUploadHistory() {
  await wait(280);
  return uploadHistory;
}

export async function simulateUpload(fileName: string) {
  await wait(1100);
  return { file: fileName, rows: 3124, valid: 3118, warnings: 6, changes: 1 };
}

export async function mergeAsinChange(id: string) {
  await wait(650);
  return { id, mergedAt: new Date().toISOString(), preservedHistory: true };
}
