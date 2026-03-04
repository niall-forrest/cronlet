import { PricingTable, SignedIn, SignedOut, SignInButton } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function BillingPage() {
  return (
    <div className="grid gap-4">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="display-title">Billing</CardTitle>
          <CardDescription>
            Choose a plan for your Cronlet Cloud usage. Billing is managed by Clerk.
          </CardDescription>
        </CardHeader>
      </Card>

      <SignedOut>
        <Card className="border-border/70 bg-card/80">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wider text-muted-foreground">Sign In Required</CardTitle>
            <CardDescription>
              You must be signed in to view available subscription plans.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SignInButton mode="modal">
              <Button>Sign in</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </SignedOut>

      <SignedIn>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-4">
            <div className="overflow-x-auto">
              <PricingTable />
            </div>
          </CardContent>
        </Card>
      </SignedIn>
    </div>
  );
}

