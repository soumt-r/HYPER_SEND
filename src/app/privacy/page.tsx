import { connection } from "next/server";
import { getContactEmail } from "@/lib/site";
import { MAX_EXPIRE_HOURS } from "@/lib/expiry";

export default async function PrivacyPolicy() {
  // Read CONTACT_EMAIL at request time (the image is built without it)
  await connection();
  const contactEmail = getContactEmail();
  const maxDays = MAX_EXPIRE_HOURS / 24;

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
            HYPER_SEND는 파일 공유 서비스 제공을 위해 아래 정보를 처리합니다.<br/>
            - <strong>로그인 시 수집 (필수):</strong> 구글 계정 식별자, 이메일 주소(@hanyang.ac.kr), 이름, 프로필 사진<br/>
            - <strong>서비스 이용 중 생성:</strong> 업로드한 파일, 파일 메타데이터(파일명, 형식, 크기, 업로드 시각, 만료 조건, 다운로드 횟수), 로그인 시각<br/>
            - <strong>자동으로 처리되는 정보:</strong> 접속 IP 주소(요청 횟수 제한에만 사용하며 저장하지 않음), 로그인 유지용 쿠키<br/>
            다운로드만 하는 이용자는 로그인하지 않으며, 접속 IP 외에는 어떤 정보도 처리하지 않습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">2. 개인정보의 이용 목적</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 한양대학교 구성원(@hanyang.ac.kr) 인증 및 업로드 권한 확인<br/>
            - 본인이 업로드한 파일 목록 관리 및 저장 용량(Quota) 계산<br/>
            - 과도한 요청, 다운로드 코드 무작위 대입 등 부정 이용 방지<br/>
            - 불법·유해 파일 신고 처리 및 이용 제한
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">3. 파일 및 데이터 보안 (종단간 암호화)</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 비밀번호를 설정해 업로드하면 파일 내용은 이용자의 브라우저에서 <strong>종단간 암호화(AES-256-GCM)</strong>된 뒤 전송됩니다.<br/>
            - 비밀번호는 서버로 전송되거나 저장되지 않으므로, 운영자도 암호화된 파일의 내용을 열람할 수 없습니다.<br/>
            - 파일명과 형식도 브라우저에서 함께 암호화되며, 비밀번호를 아는 사람만 파일 목록을 보고 내려받을 수 있습니다. 서버는 비밀번호에서 따로 만든 확인용 값의 해시만 저장해, 비밀번호가 맞는지만 확인할 수 있습니다.<br/>
            - 단, 파일 크기·개수·업로드 시각·만료 조건은 암호화되지 않습니다.<br/>
            - 비밀번호를 설정하지 않은 파일은 암호화되지 않은 상태로 서버에 저장됩니다.<br/>
            - <strong>공용 PC 업로드:</strong> 공용 PC는 로그인하지 않고, 이용자가 로그인된 휴대폰에서 승인한 업로드 1회만 할 수 있습니다. 승인 요청에는 PC의 브라우저·OS 종류(IP 제외)가 기록되어 승인 화면에 표시되며, 6시간 안에 삭제됩니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">4. 보유 및 파기</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - <strong>업로드된 파일과 메타데이터:</strong> 이용자가 지정한 만료 조건(다운로드 횟수 또는 시간)에 도달하거나, 조건과 관계없이 업로드 후 최대 {maxDays}일이 지나면 자동으로 영구 삭제됩니다. 이용자가 직접 삭제하거나 계정을 삭제하면 즉시 삭제됩니다.<br/>
            - <strong>계정 정보:</strong> 계정을 삭제할 때까지 보관하며, 삭제 시 즉시 파기합니다.<br/>
            - <strong>접속 IP:</strong> 서버 메모리에서 요청 횟수 계산에만 쓰이며 약 15분 안에 사라지고, 디스크나 데이터베이스에 저장하지 않습니다.<br/>
            - <strong>로그인 쿠키:</strong> 최대 7일간 유지되며, 로그아웃하면 해당 계정의 모든 로그인이 무효화됩니다.<br/>
            운영자가 장애 대비용 백업을 보관하는 경우, 삭제된 정보가 백업 보관 기간 동안 백업본에 남아 있을 수 있습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">5. 처리 위탁 및 국외 이전</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            서비스 제공을 위해 아래 업체의 서비스를 이용합니다.<br/>
            - <strong>Google LLC (미국):</strong> 로그인 인증. 로그인 시 구글 계정 정보가 처리됩니다.<br/>
            - <strong>Cloudflare, Inc. (미국 및 전 세계 데이터센터):</strong> 네트워크 전송 및 보안. 서비스에 대한 모든 요청(접속 IP, 전송되는 파일 포함)이 Cloudflare 네트워크를 거쳐 전달됩니다.<br/>
            이 외에 개인정보를 처리 위탁하거나 국외로 이전하지 않습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">6. 제3자 제공</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            HYPER_SEND는 개인정보를 제3자에게 제공하지 않습니다. 단, 법령에 근거하거나 수사기관이 법령에 정해진 절차에 따라 요구하는 경우는 예외로 합니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">7. 이용자의 권리</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 내 파일 목록(MY_FILES)에서 업로드한 파일을 확인하고 언제든 삭제할 수 있습니다.<br/>
            - 같은 화면의 계정 삭제(DELETE_ACCOUNT)로 계정과 모든 파일을 즉시 삭제할 수 있습니다.<br/>
            - 그 밖의 열람·정정·처리정지 요청은 아래 연락처로 보내주세요.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">8. 쿠키 및 브라우저 저장소</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 로그인 유지를 위해 암호화된 쿠키(authjs.session-token)를 사용합니다.<br/>
            - 화면 테마(라이트/다크) 설정을 브라우저에 저장합니다.<br/>
            - 광고나 방문 분석을 위한 쿠키는 사용하지 않습니다.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="font-mono text-sm tracking-widest font-semibold uppercase">9. 개인정보 보호책임자</h2>
          <p className="text-sm leading-relaxed text-[#555555]">
            - 책임자: Soumt (서비스 운영자)<br/>
            - 연락처: {contactEmail ? (
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
