import { useAuth, useOrganization, useUser } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { resetCloudAuthProvider, setCloudAuthProvider } from "@/lib/api";

export function ClerkAuthBridge() {
  const queryClient = useQueryClient();
  const { isSignedIn, getToken } = useAuth();
  const { organization } = useOrganization();
  const { user } = useUser();
  const previousKey = useRef<string>("");

  useEffect(() => {
    setCloudAuthProvider(async () => {
      if (!isSignedIn) {
        return {
          token: null,
          orgId: null,
          userId: null,
        };
      }

      const token = await getToken();
      const personalOrgId = user?.id ? `personal_${user.id}` : null;
      return {
        token: token ?? null,
        orgId: organization?.id ?? personalOrgId,
        userId: user?.id ?? null,
      };
    });

    return () => {
      resetCloudAuthProvider();
    };
  }, [getToken, isSignedIn, organization?.id, user?.id]);

  useEffect(() => {
    const currentKey = `${isSignedIn ? "signed-in" : "signed-out"}:${organization?.id ?? "no-org"}:${user?.id ?? "no-user"}`;
    if (previousKey.current && previousKey.current !== currentKey) {
      queryClient.clear();
    }
    previousKey.current = currentKey;
  }, [isSignedIn, organization?.id, queryClient, user?.id]);

  return null;
}
