import Link from "next/link";
import { redirect } from "next/navigation";
import { FlaskConical as Logo, SearchX, Wrench } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Public QR entry point: /scan/{qrToken} — resolves the token within the
// signed-in user's organization and forwards to the equipment detail page.
export default async function ScanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const session = await getSession();
  if (!session) redirect("/login");

  const equipment = await db.equipment.findFirst({
    where: { qrToken: token, organizationId: session.orgId },
    select: { id: true, name: true },
  });

  if (!equipment) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md text-center">
          <CardHeader className="items-center">
            <div className="mx-auto mb-2 flex aspect-square size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Logo className="size-5" aria-hidden="true" />
            </div>
            <CardTitle className="flex items-center justify-center gap-2 text-xl">
              <SearchX className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              Equipment not found
            </CardTitle>
            <CardDescription>
              This QR code does not match any equipment, or it belongs to another organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            The scanned token may be outdated or damaged. Browse the equipment register instead.
          </CardContent>
          <CardFooter className="justify-center gap-2">
            <Button asChild>
              <Link href="/equipment">
                <Wrench className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Go to equipment
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/dashboard">Operations Center</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    );
  }

  redirect(`/equipment/${equipment.id}`);
}
