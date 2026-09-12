begin;

alter table public.products drop constraint if exists products_category_check;
alter table public.products add constraint products_category_check check (
  category in (
    'Alfabetização',
    'Números e contagem',
    'Estimulação cognitiva',
    'Coordenação motora',
    'Linguagem e associação',
    'Cores e percepção',
    'Jogos',
    'Sensoriais'
  )
);

notify pgrst, 'reload schema';
commit;
