import { Checkbox } from "@/components/ui/primitives";

/** Campo "Ativo" para formulários de edição (desativar mantém o histórico). */
export function ActiveField({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <input type="hidden" name="has_active" value="1" />
      <Checkbox name="active" label="Ativo" defaultChecked={defaultChecked} />
      <p className="text-xs text-ink-faint">Desativar esconde das listas sem apagar o histórico.</p>
    </div>
  );
}

export function Hidden({ name, value }: { name: string; value: string | null | undefined }) {
  return <input type="hidden" name={name} value={value ?? ""} />;
}
