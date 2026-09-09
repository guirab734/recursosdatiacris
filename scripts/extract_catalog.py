"""Importa somente a atribuição literal do catálogo anterior, sem executar o gerador."""
import ast, json, uuid
from pathlib import Path
root = Path(__file__).resolve().parent.parent
tree = ast.parse((root / 'build/gerar_site.py').read_text(encoding='utf-8'))
node = next(n for n in tree.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'PRODUTOS' for t in n.targets))
records = []
priority = ['contando-as-batatas', 'desafio-dos-pompons', 'fabrica-de-picoles', 'sorvete-cognitivo', 'livro-das-vogais', 'livro-das-cores']
placeholders = ['livro-pedagogico', 'mata-moscas-1-a-20', 'uno-campeonato', 'pescando-as-silabas', 'martelinho-da-matematica']
for item in node.value.elts:
    p = {kw.arg: ast.literal_eval(kw.value) for kw in item.keywords}
    if p['slug'] in placeholders:
        continue
    records.append(dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL, 'recursosdatiacris/' + p['slug'])), slug=p['slug'], name=p['nome'].replace(' – ', ': ').replace(' — ', ': '), description=p['desc'], skills=p['hab'], price_cents=round(p['preco']*100), category=p['cat'], active=True, badge='Escolha da Tia Cris' if p['slug'] in priority[:3] else None, created_at='2026-09-09T12:00:00Z', updated_at='2026-09-09T12:00:00Z', media=[dict(id=str(uuid.uuid5(uuid.NAMESPACE_URL, p['slug'] + '/cover')), type='image', url='/assets/img/' + p['slug'] + '-700.webp', position=0)]))
records.sort(key=lambda p: priority.index(p['slug']) if p['slug'] in priority else 99)
(root/'lib/catalog-seed.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'{len(records)} produtos com fotos reais importados. A importação de produção mantém os novos recursos inativos para revisão de preços.')
