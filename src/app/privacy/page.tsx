export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FFFFFF] p-8 md:p-16">
      <div className="max-w-3xl mx-auto space-y-8">
        
        <header className="border-b-[0.5px] border-[#EEEEEE] pb-8 mb-12">
          <h1 className="font-mono text-2xl tracking-tighter uppercase font-bold">Privacy Policy</h1>
          <p className="font-mono text-xs text-[#999999] mt-2">개인정보처리방침 (시행일: 2026. 09. 30)</p>
        </header>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">1. 수집하는 개인정보 항목</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            HYPER_SEND는 원활한 파일 공유 서비스 제공을 위해 아래와 같은 개인정보를 수집합니다.<br/>
            - <strong>필수 수집 항목:</strong> 구글 계정 식별자, 이메일 주소(@hanyang.ac.kr), 이름, 프로필 사진<br/>
            - <strong>서비스 이용 과정에서 생성되는 정보:</strong> 업로드한 파일의 메타데이터(파일명, 용량, 확장자), 업로드/다운로드 IP 및 시간
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">2. 개인정보의 수집 및 이용 목적</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            수집한 개인정보는 다음의 목적을 위해 활용됩니다.<br/>
            - 한양대학교 구성원(@hanyang.ac.kr) 인증 및 서비스 접근 권한 제어<br/>
            - 본인이 업로드한 파일 목록 관리 및 스토리지 할당량(Quota) 추적<br/>
            - 부정 이용 방지 및 서비스 안정성 확보
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">3. 파일 및 데이터 보안 (종단간 암호화)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 사용자가 비밀번호를 설정하여 파일을 업로드할 경우, 파일 내용은 사용자의 기기(브라우저)에서 <strong>종단간 암호화(E2EE, AES-GCM)</strong> 처리된 후 서버로 전송됩니다.<br/>
            - 서버는 암호화된 파일 데이터만 보관하며, 암호화에 사용된 비밀번호는 어떠한 형태로도 서버에 전송되거나 저장되지 않습니다. 따라서 관리자나 서버 운영자도 사용자의 파일 내용을 열람할 수 없습니다.<br/>
            - 단, 파일의 이름(파일명)과 용량 등 메타데이터는 식별을 위해 암호화되지 않은 상태로 저장됩니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">4. 개인정보의 보유 및 이용 기간</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            원칙적으로 개인정보의 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이 파기합니다.<br/>
            - 업로드된 파일: 사용자가 지정한 만료 조건(시간 또는 다운로드 횟수) 도달 시 서버에서 영구 삭제됩니다.<br/>
            - 계정 정보: 사용자가 계정 탈퇴를 요청하거나, 학적 변동 등으로 한양대학교 이메일 자격이 상실된 경우 파기됩니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">5. 개인정보 제3자 제공</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            HYPER_SEND는 사용자의 개인정보를 제3자에게 제공하지 않습니다. 단, 법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우는 예외로 합니다.
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
