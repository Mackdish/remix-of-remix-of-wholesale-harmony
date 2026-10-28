import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/use-install-prompt";

/** Shows an install button when the browser allows installing the app. */
export function InstallAppButton({ className }: { className?: string }) {
  const { canPrompt, prompt } = useInstallPrompt();
  if (!canPrompt) return null;

  return (
    <Button variant="outline" size="sm" className={className} onClick={() => void prompt()}>
      <Download className="mr-2 h-4 w-4" />
      Install app
    </Button>
  );
}
