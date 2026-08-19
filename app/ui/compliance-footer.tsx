import { BadgeCheck, Landmark } from "lucide-react";

export function ComplianceFooter({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <footer className="compliance-footer" aria-label="网站备案信息">
      <a href="https://beian.miit.gov.cn/" rel="nofollow noreferrer" target="_blank">
        <Landmark aria-hidden="true" size={14} />
        粤ICP备2025454179号
      </a>
      <span aria-hidden="true" />
      <a
        href="https://beian.mps.gov.cn/#/query/webSearch?code=44060502003974"
        rel="nofollow noreferrer"
        target="_blank"
      >
        <BadgeCheck aria-hidden="true" size={14} />
        粤公网安备44060502003974号
      </a>
    </footer>
  );
}
