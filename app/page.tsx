// 화면 틀. 서버에서 추천 데이터를 읽어 브라우저 쪽 ConsultPanel에 넘긴다. 설계 근거: DESIGN.md §6
import { getCounselData } from "@/lib/data";
import ConsultPanel from "./_components/ConsultPanel";

export default function Home() {
  return (
    // 넓은 상담 모니터에서는 두 칸으로 펼치므로 폭을 넓게 둔다.
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:py-6">
      <ConsultPanel data={getCounselData()} />
    </main>
  );
}
