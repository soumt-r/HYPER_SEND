import { connection } from "next/server";
import { getContactEmail } from "@/lib/site";
import { MAX_EXPIRE_HOURS } from "@/lib/expiry";

export default async function TermsOfService() {
  // Read CONTACT_EMAIL at request time (the image is built without it)
  await connection();
  const contactEmail = getContactEmail();
  const maxDays = MAX_EXPIRE_HOURS / 24;

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FFFFFF] p-8 md:p-16">
      <div className="max-w-3xl mx-auto space-y-8">

        <header className="border-b-[0.5px] border-[#EEEEEE] pb-8 mb-12">
          <h1 className="font-mono text-2xl tracking-tighter uppercase font-bold">Terms of Service</h1>
          <p className="font-mono text-xs text-[#999999] mt-2">서비스 이용약관 (시행일: 2026. 09. 30)</p>
        </header>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제1조 (목적)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            본 약관은 HYPER_SEND(이하 &quot;서비스&quot;)가 제공하는 파일 공유 및 전송 서비스의 이용 조건, 절차 및 이용자와 서비스 제공자의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제2조 (서비스의 성격 및 이용 대상)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 파일 업로드는 한양대학교 구성원(@hanyang.ac.kr 구글 계정 보유자)만 할 수 있습니다.<br/>
            - 업로드한 파일에는 다운로드 코드가 발급되며, 코드를 아는 사람은 누구나 로그인 없이 파일을 받을 수 있습니다. 코드를 공유할 상대는 이용자가 신중히 선택해야 합니다.<br/>
            - 본 서비스는 개인이 운영하는 비영리 서비스이며, 한양대학교의 공식 서비스가 아닙니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제3조 (이용자의 의무)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            1. 이용자는 타인의 지식재산권(저작권 등)을 침해하는 파일, 불법촬영물 및 음란물, 개인정보를 무단으로 담은 파일, 악성 코드를 포함한 파일 등 법령을 위반하는 파일을 업로드하거나 공유할 수 없습니다.<br/>
            2. 위 1항에 해당하는 파일을 유포하여 발생하는 법적 책임은 해당 파일을 업로드한 이용자에게 있습니다.<br/>
            3. 이용자는 서비스의 시스템, 네트워크를 무단으로 변경하거나 과도한 부하를 일으키는 행위를 해서는 안 됩니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제4조 (신고 및 이용 제한)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            1. 제3조를 위반하는 것으로 보이는 파일은 다운로드 화면의 신고 링크 또는 아래 연락처로 신고할 수 있습니다.<br/>
            2. 운영자는 신고를 받거나 위반을 확인한 경우, 사전 통지 없이 해당 파일을 삭제할 수 있습니다.<br/>
            3. 운영자는 위반한 이용자의 서비스 이용을 제한(차단)할 수 있으며, 차단된 이용자는 모든 기기에서 로그아웃되고 업로드한 파일이 모두 삭제됩니다.<br/>
            4. 운영자는 법령에 따른 요청이 있는 경우 수사기관 등에 협조할 수 있습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제5조 (서비스 제공자의 권리와 면책)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            1. 서비스 운영자는 서버 유지보수, 용량 확보, 또는 보안상의 이유로 사전 고지 없이 시스템을 중단하거나, 보관된 파일을 삭제할 수 있습니다.<br/>
            2. 본 서비스는 개인 프로젝트로 운영되므로, <strong>업로드된 파일의 보존이나 데이터의 무결성을 보장하지 않습니다.</strong> 중요한 파일은 반드시 본인의 기기에 보관해야 합니다.<br/>
            3. 서비스 제공자는 파일의 유실·손상이나 서비스 이용 장애로 발생한 손해에 대해, 운영자의 고의 또는 중대한 과실이 없는 한 책임지지 않습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제6조 (저장 용량 및 만료)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 각 이용자에게는 정해진 저장 용량(Quota)이 부여되며, 한도를 넘어 업로드할 수 없습니다.<br/>
            - 모든 파일은 이용자가 설정한 다운로드 횟수 또는 시간에 도달하거나, 조건과 관계없이 업로드 후 최대 {maxDays}일이 지나면 자동으로 삭제되며 복구할 수 없습니다.<br/>
            - 서버 저장 공간이 부족한 경우 업로드가 일시적으로 제한될 수 있습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제7조 (계정 삭제)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            이용자는 내 파일 목록(MY_FILES)의 계정 삭제(DELETE_ACCOUNT)로 언제든 계정을 삭제할 수 있으며, 이때 업로드한 모든 파일도 즉시 삭제됩니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">연락처</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            {contactEmail ? (
              <a href={`mailto:${contactEmail}`} className="text-[#2549BB] underline">{contactEmail}</a>
            ) : (
              <span className="text-[#999999]">(운영자가 아직 연락처를 등록하지 않았습니다)</span>
            )}
          </p>
        </section>

        <div className="pt-12">
          <a href="/" className="font-mono text-xs text-[#2549BB] hover:text-[#172B66] underline transition-colors">
            ← BACK TO HOME
          </a>
        </div>
      </div>
    </div>
  );
}
