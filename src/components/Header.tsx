import { Shield, Printer } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b bg-card">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Printer className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">SecurePrint</h1>
            <p className="text-xs text-muted-foreground">One-Time Print System</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Shield className="w-4 h-4" />
          <span>Secure • One-Time • Protected</span>
        </div>
      </div>
    </header>
  );
}
