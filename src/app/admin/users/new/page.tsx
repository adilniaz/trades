"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema, type CreateUserInput } from "@/lib/validation/user";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createUser } from "@/app/admin/users/actions";
import { useTransition, useCallback } from "react";

type FormValues = {
  email: string;
  password: string;
  role: "ADMIN" | "USER";
};

export default function NewUserPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
    watch,
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createUserSchema) as any,
    defaultValues: {
      email: "",
      password: "",
      role: "USER",
    },
  });

  const roleValue = watch("role");

  const submit = useCallback(
    async (data: FormValues) => {
      startTransition(async () => {
        const raw = (await createUser(data as unknown as CreateUserInput)) as
          | Record<string, unknown>
          | undefined;
        if (
          raw &&
          "error" in raw &&
          typeof raw.error === "object" &&
          raw.error !== null &&
          !Array.isArray(raw.error)
        ) {
          const fieldErrors = raw.error as Record<string, string[]>;
          for (const [field, messages] of Object.entries(fieldErrors)) {
            if (messages.length > 0) {
              setError(field as keyof FormValues, { message: messages[0] });
            }
          }
          return;
        }
        if (raw && "error" in raw && typeof raw.error === "string") {
          setError("root", { message: raw.error as string });
          return;
        }
        router.push("/admin/users");
      });
    },
    [router, setError, startTransition]
  );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Add User</h1>
        <Button variant="outline" onClick={() => router.push("/admin/users")}>
          Back
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New User</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(submit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...register("password")}
              />
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={roleValue}
                onValueChange={(v) =>
                  setValue("role", v as "ADMIN" | "USER", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">USER</SelectItem>
                  <SelectItem value="ADMIN">ADMIN</SelectItem>
                </SelectContent>
              </Select>
              {errors.role && (
                <p className="text-sm text-red-600">{errors.role.message}</p>
              )}
            </div>

            {errors.root && (
              <p className="text-sm text-red-600">
                {(errors.root.message as string) ?? "An unexpected error occurred"}
              </p>
            )}

            <Button type="submit" disabled={isPending || isSubmitting}>
              {isSubmitting || isPending ? "Creating…" : "Create User"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
