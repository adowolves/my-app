// 변환된 추천 데이터를 불러온다. 원본은 data/counsel-db.xlsx이고, `npm run data`로 JSON을 다시 만든다.
// 설계 근거: DESIGN.md §6 (빌드 결과에 데이터가 들어가므로 배포 후 따로 파일을 읽지 않음)
import counselDb from "@/data/counsel-db.json";
import type { CounselData } from "./types";

export function getCounselData(): CounselData {
  return counselDb as CounselData;
}
