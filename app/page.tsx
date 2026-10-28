// 화면 틀. 서버에서 추천 데이터를 읽어 브라우저 쪽 ConsultPanel에 넘긴다. 설계 근거: DESIGN.md §6
import { getCounselData } from "@/lib/data";
import ConsultPanel from "./_components/ConsultPanel";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <ConsultPanel data={getCounselData()} />
    </main>
  );
}
