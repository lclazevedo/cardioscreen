from sqlalchemy import create_engine, text, inspect
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
print(f"DATABASE_URL: {DATABASE_URL}")

engine = create_engine(DATABASE_URL)

# Verificar colunas existentes
inspector = inspect(engine)
existing_columns = [col['name'] for col in inspector.get_columns('laudos_processados')]
print(f"Colunas existentes: {existing_columns}")

# Colunas a adicionar (SQLite não suporta IF NOT EXISTS)
columns_to_add = [
    ('editado_manualmente', 'BOOLEAN DEFAULT FALSE'),
    ('analise_antes_edicao', 'JSON'),
    ('editado_em', 'TIMESTAMP'),
    ('corrigido_em', 'TIMESTAMP')
]

with engine.connect() as conn:
    for col_name, col_type in columns_to_add:
        if col_name not in existing_columns:
            try:
                conn.execute(text(f'ALTER TABLE laudos_processados ADD COLUMN {col_name} {col_type}'))
                print(f"OK: Adicionada coluna {col_name}")
            except Exception as e:
                print(f"Erro ao adicionar {col_name}: {e}")
        else:
            print(f"Coluna {col_name} já existe")
    conn.commit()

print("Colunas verificadas/adicionadas com sucesso!")
