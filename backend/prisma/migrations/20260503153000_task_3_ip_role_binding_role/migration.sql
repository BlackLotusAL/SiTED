-- CreateEnum
CREATE TYPE "IpRoleBindingRole" AS ENUM ('learner', 'content_admin');

-- AlterTable
ALTER TABLE "IpRoleBinding" DROP CONSTRAINT IF EXISTS "IpRoleBinding_role_check";
ALTER TABLE "IpRoleBinding"
  ALTER COLUMN "role" TYPE "IpRoleBindingRole"
  USING ("role"::text::"IpRoleBindingRole");
ALTER TABLE "IpRoleBinding"
  ADD CONSTRAINT "IpRoleBinding_role_check" CHECK ("role" IN ('learner'::"IpRoleBindingRole", 'content_admin'::"IpRoleBindingRole"));
