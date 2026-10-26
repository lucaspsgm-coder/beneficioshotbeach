import { Plus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getOrg, getUserDirectory } from "@/lib/data";
import { fmtDateTime } from "@/lib/format";
import { PageHeader, Panel, Button, Field, Input, Select, Table, Th, Td, Tr, Badge, Checkbox } from "@/components/ui/primitives";
import { FormDialog } from "@/components/action-form";
import { Hidden } from "@/components/fields";
import { createUser, updateUser, resetPassword } from "./actions";
import type { Profile, BusinessUnit } from "@/lib/types";

export default async function UsuariosPage() {
  const me = await requireAdmin();
  const supabase = await createClient();
  const [{ data }, org, dir] = await Promise.all([supabase.from("profiles").select("*").order("full_name"), getOrg(), getUserDirectory()]);
  const users = (data ?? []) as Profile[];

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Administradores veem todas as unidades. O RH da unidade vê e movimenta só os colaboradores da própria unidade."
        actions={
          <FormDialog trigger={<Button><Plus />Novo usuário</Button>} title="Novo usuário" action={createUser} submitLabel="Criar usuário">
            <Field label="Usuário" required hint="Usado no login. Ex.: maria.souza">
              <Input name="username" autoComplete="off" required />
            </Field>
            <Field label="Nome completo" required>
              <Input name="full_name" required />
            </Field>
            <RoleFields units={org.units} />
            <Field label="Senha inicial" required hint="Mínimo de 8 caracteres. Peça para a pessoa trocar no primeiro acesso.">
              <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
          </FormDialog>
        }
      />
      <Panel>
        <Table>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>Usuário</Th>
              <Th>Perfil</Th>
              <Th>Criado</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <Tr key={u.id} className={u.active ? "" : "text-ink-faint"}>
                <Td className="font-medium">
                  {u.full_name}
                  {u.id === me.id && <span className="ml-2 text-xs font-normal text-ink-faint">(você)</span>}
                  {!u.active && <Badge className="ml-2">Desativado</Badge>}
                </Td>
                <Td className="text-ink-soft">{u.username}</Td>
                <Td>
                  {u.role === "ADMIN" ? (
                    <Badge tone="petrol">Administrador</Badge>
                  ) : (
                    <span className="text-ink-soft">RH · {org.units.find((x) => x.id === u.business_unit_id)?.name ?? "—"}</span>
                  )}
                </Td>
                <Td className="text-xs text-ink-faint">
                  {fmtDateTime(u.created_at)}
                  <br />
                  por {u.created_by ? dir.get(u.created_by)?.username ?? "—" : "sistema"}
                </Td>
                <Td className="whitespace-nowrap text-right">
                  <FormDialog trigger={<Button variant="ghost" size="sm">Editar</Button>} title={`Editar ${u.username}`} action={updateUser}>
                    <Hidden name="id" value={u.id} />
                    <Field label="Nome completo" required>
                      <Input name="full_name" defaultValue={u.full_name} required />
                    </Field>
                    <RoleFields units={org.units} profile={u} />
                    <Checkbox name="active" label="Acesso ativo" defaultChecked={u.active} />
                  </FormDialog>
                  <FormDialog trigger={<Button variant="ghost" size="sm">Redefinir senha</Button>} title={`Nova senha para ${u.username}`} action={resetPassword} submitLabel="Redefinir senha">
                    <Hidden name="id" value={u.id} />
                    <Field label="Nova senha" required hint="Mínimo de 8 caracteres.">
                      <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
                    </Field>
                  </FormDialog>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}

function RoleFields({ units, profile }: { units: BusinessUnit[]; profile?: Profile }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Perfil" required>
        <Select name="role" defaultValue={profile?.role ?? "RH_UNIT"}>
          <option value="RH_UNIT">RH da unidade</option>
          <option value="ADMIN">Administrador</option>
        </Select>
      </Field>
      <Field label="Unidade" hint="Obrigatória para RH.">
        <Select name="business_unit_id" defaultValue={profile?.business_unit_id ?? ""}>
          <option value="">—</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </Select>
      </Field>
    </div>
  );
}
