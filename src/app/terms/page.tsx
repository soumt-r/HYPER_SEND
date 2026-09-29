export default function TermsOfService() {
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
            본 약관은 HYPER_SEND(이하 "서비스")가 제공하는 파일 공유 및 전송 서비스의 이용 조건, 절차 및 이용자와 서비스 제공자의 권리, 의무 및 책임 사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제2조 (서비스의 성격 및 이용 대상)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 본 서비스는 한양대학교 구성원(@hanyang.ac.kr 구글 계정 보유자)만을 대상으로 제공되는 교내용 파일 공유 서비스입니다.<br/>
            - 사용자는 업로드한 파일에 대해 일회성 또는 시간 제한이 있는 다운로드 코드를 생성하여 타인과 공유할 수 있습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제3조 (이용자의 의무)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            1. 이용자는 타인의 지식재산권(저작권 등)을 침해하는 파일, 불법 포르노그래피, 악성 코드 및 바이러스를 포함한 파일 등을 업로드하거나 공유할 수 없습니다.<br/>
            2. 위 1항에 해당하는 불법적이거나 악의적인 파일을 유포하여 발생하는 모든 법적 책임은 해당 파일을 업로드한 이용자 본인에게 있습니다.<br/>
            3. 이용자는 서비스의 시스템, 네트워크를 무단으로 변경하거나 과도한 부하를 일으키는 행위를 해서는 안 됩니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제4조 (서비스 제공자의 권리와 면책)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            1. 서비스 운영자는 서버 유지보수, 용량 확보, 또는 보안상의 이유로 사전 고지 없이 시스템을 중단하거나, 보관된 파일을 삭제할 수 있는 권리를 가집니다.<br/>
            2. 본 서비스는 개인 프로젝트 및 교내 편의용으로 운영되므로, <strong>업로드된 파일의 보존이나 데이터의 무결성을 어떠한 경우에도 보장하지 않습니다.</strong> 중요한 파일은 반드시 본인의 기기에 백업해야 합니다.<br/>
            3. 서비스 제공자는 사용자가 업로드한 파일이 유실, 손상되거나 서비스 이용 장애로 인해 발생한 직·간접적인 손해에 대해 일절 책임지지 않습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">제5조 (스토리지 용량 및 만료 제한)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 각 사용자에게는 사전에 정해진 기본 스토리지 할당량(Quota)이 부여되며, 한도를 초과하여 업로드할 수 없습니다.<br/>
            - 모든 파일은 사용자가 설정한 기한 또는 다운로드 횟수를 초과하면 자동으로 만료되어 복구 불가능하게 삭제됩니다.
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
