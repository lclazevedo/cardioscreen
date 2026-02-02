# CardioScreen 🫀

Sistema de triagem automatizada de estenose aórtica para indicação TAVI usando IA (Claude Haiku).

## 📋 Sobre o Projeto

**CardioScreen** é uma aplicação web que automatiza a análise de laudos de ecocardiograma para identificar pacientes com estenose aórtica que necessitam de avaliação para procedimento TAVI (Transcatheter Aortic Valve Implantation).

### Problema que Resolve

Muitos pacientes realizam ecocardiogramas que detectam estenose aórtica importante, mas essa informação crítica não é identificada ou encaminhada adequadamente. O CardioScreen:

- ✅ Automatiza a leitura de laudos em PDF
- ✅ Identifica estenose aórtica e sua gravidade
- ✅ Classifica por prioridade (alta/média/baixa)
- ✅ Indica candidatos a TAVI
- ✅ Gera fila de revisão para cardiologistas

### Tecnologias

**Backend:**
- Python 3.10+
- FastAPI
- Anthropic API (Claude Haiku 4.5)
- PyPDF2

**Frontend:**
- React 18 + TypeScript
- Tailwind CSS
- Lucide React (ícones)

## 🚀 Setup Rápido

### Pré-requisitos

```bash
# Backend
Python 3.10+
pip

# Frontend
Node.js 18+
npm ou yarn

# API Key
Anthropic API Key (https://console.anthropic.com/)
```

### 1. Backend

```bash
cd backend

# Criar ambiente virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate  # Windows

# Instalar dependências
pip install -r requirements.txt

# Configurar variáveis de ambiente
cp .env.example .env
# Editar .env e adicionar sua ANTHROPIC_API_KEY

# Rodar servidor
python app/main.py
# Ou: uvicorn app.main:app --reload
```

Backend disponível em: `http://localhost:8000`  
Documentação API: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend

# Instalar dependências
npm install

# Rodar desenvolvimento
npm start
```

Frontend disponível em: `http://localhost:3000`

## 📁 Estrutura do Projeto

```
cardioscreen/
├── backend/
│   ├── app/
│   │   └── main.py              # FastAPI app principal
│   ├── requirements.txt         # Dependências Python
│   └── .env.example            # Template de variáveis
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx             # Componente principal
│   │   ├── App.css             # Estilos + Tailwind
│   │   └── index.tsx           # Entry point
│   ├── package.json
│   ├── tailwind.config.js
│   └── tsconfig.json
│
├── tests/
│   └── laudos_exemplo/         # Laudos de teste
│       ├── laudo_estenose_grave_01.txt
│       ├── laudo_estenose_moderada_02.txt
│       └── laudo_normal_03.txt
│
└── README.md
```

## 🧪 Testando o Sistema

### Converter laudos de exemplo para PDF

```bash
# Você pode usar qualquer ferramenta para converter .txt em .pdf
# Online: https://www.ilovepdf.com/txt_to_pdf
# Ou usar Python:

cd tests/laudos_exemplo
python -c "
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

for txt_file in ['laudo_estenose_grave_01.txt', 'laudo_estenose_moderada_02.txt', 'laudo_normal_03.txt']:
    pdf_file = txt_file.replace('.txt', '.pdf')
    c = canvas.Canvas(pdf_file, pagesize=letter)
    with open(txt_file, 'r', encoding='utf-8') as f:
        text = f.read()
    y = 750
    for line in text.split('\n'):
        c.drawString(50, y, line)
        y -= 15
    c.save()
    print(f'Criado: {pdf_file}')
"
```

### Testar API diretamente

```bash
curl http://localhost:8000/

# Testar com texto direto
curl -X POST http://localhost:8000/analisar-texto \
  -H "Content-Type: application/json" \
  -d '{"texto": "Estenose aórtica importante. Área valvar: 0.8 cm². Gradiente médio: 45 mmHg."}'
```

## 🔧 Configuração da API Anthropic

### Obter API Key

1. Acesse: https://console.anthropic.com/
2. Faça login ou crie conta
3. Vá em "API Keys"
4. Crie nova key
5. Copie e cole no `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxx
```

### Modelo Utilizado

- **claude-haiku-4-5-20251001** (Claude Haiku 4.5)
- Mais barato (~US$ 0.25 / 1M tokens de entrada)
- Mais rápido (~2-3 segundos por laudo)
- Suficiente para tarefa específica de extração estruturada

### Custos Estimados

- **1 laudo:** ~500 tokens entrada + 200 saída = ~US$ 0.0002
- **1000 laudos/mês:** ~US$ 0.20
- **10.000 laudos/mês:** ~US$ 2.00

## 📊 API Endpoints

### `GET /`
Health check

### `POST /analisar-laudo`
Analisa um único laudo PDF

**Request:**
```
Content-Type: multipart/form-data
file: <arquivo.pdf>
```

**Response:**
```json
{
  "arquivo": "laudo_001.pdf",
  "timestamp": "2026-01-31T10:30:00",
  "analise": {
    "tem_estenose": true,
    "gravidade": "importante",
    "area_valvar": 0.7,
    "gradiente_medio": 48,
    "velocidade_maxima": 4.5,
    "prioridade": "alta",
    "justificativa": "Estenose aórtica importante com área...",
    "indicacao_tavi": true,
    "confianca": 0.95
  }
}
```

### `POST /processar-lote`
Processa múltiplos laudos (até 100)

**Request:**
```
Content-Type: multipart/form-data
arquivos: [<arquivo1.pdf>, <arquivo2.pdf>, ...]
```

**Response:**
```json
{
  "total_processados": 10,
  "para_revisao": 3,
  "laudos": [...]
}
```

## 🎯 Critérios de Triagem

### Prioridade ALTA (indicação TAVI)
- Estenose importante/grave **E**
- Área valvar < 1.0 cm² **OU**
- Gradiente médio > 40 mmHg **OU**
- Velocidade máxima > 4 m/s

### Prioridade MÉDIA
- Estenose moderada a importante
- Área 1.0-1.5 cm²
- Gradiente 30-40 mmHg
- Velocidade 3-4 m/s

### Prioridade BAIXA
- Estenose leve ou ausente
- Área > 1.5 cm²
- Gradiente < 30 mmHg
- Velocidade < 3 m/s

## 🔄 Migração para Windsurf

### Instruções Detalhadas

1. **Abra o Windsurf IDE**

2. **Clone/Abra o projeto:**
   ```bash
   # Se usando Git
   git clone <seu-repositorio>
   cd cardioscreen
   
   # Ou copie toda a pasta cardioscreen/
   ```

3. **Configure Backend no Windsurf:**
   ```bash
   # Terminal 1 (Backend)
   cd backend
   python -m venv venv
   source venv/bin/activate  # ou venv\Scripts\activate (Windows)
   pip install -r requirements.txt
   
   # Criar .env com sua API key
   cp .env.example .env
   # Editar .env e adicionar ANTHROPIC_API_KEY
   
   python app/main.py
   ```

4. **Configure Frontend no Windsurf:**
   ```bash
   # Terminal 2 (Frontend)
   cd frontend
   npm install
   npm start
   ```

5. **Teste a aplicação:**
   - Backend: http://localhost:8000/docs
   - Frontend: http://localhost:3000
   - Upload de PDFs de teste

### Prompt para Windsurf Cascade

Se quiser usar o Windsurf Cascade para desenvolvimento:

```
Estou trabalhando no CardioScreen, um sistema de triagem TAVI com IA.

Contexto:
- Backend FastAPI (Python) em /backend
- Frontend React+TypeScript em /frontend
- Usa Anthropic Claude Haiku para análise de laudos
- Extrai dados de PDFs de ecocardiograma

Tarefas que posso precisar:
1. Adicionar novos endpoints na API
2. Melhorar a UI do frontend
3. Adicionar validações e tratamento de erros
4. Implementar banco de dados (PostgreSQL)
5. Criar sistema de autenticação
6. Adicionar testes automatizados
7. Melhorar o prompt de análise da IA

Estrutura atual:
[Cole a estrutura de pastas acima]

Como você pode me ajudar a evoluir este projeto?
```

## 🗂️ Próximos Passos (Roadmap)

### MVP (Atual) ✅
- [x] Backend FastAPI
- [x] Integração Claude Haiku
- [x] Frontend React
- [x] Upload de PDFs
- [x] Análise e triagem

### Fase 2 (Curto Prazo)
- [ ] Banco de dados PostgreSQL
- [ ] Autenticação JWT
- [ ] Histórico de análises
- [ ] Exportar relatórios
- [ ] Docker Compose
- [ ] Testes automatizados

### Fase 3 (Médio Prazo)
- [ ] Sistema de revisão médica
- [ ] Integração PACS/RIS
- [ ] Dashboard analítico
- [ ] Multi-tenancy (vários hospitais)
- [ ] App mobile
- [ ] Fine-tuning do modelo

## 🔍 Buscar Mais Laudos de Teste

### Prompt para buscar laudos online:

```
Busque na internet exemplos de laudos de ecocardiograma em PDF, especialmente:
- Laudos com estenose aórtica (leve, moderada, importante, grave)
- Documentos em português brasileiro
- Sites como Scribd, ResearchGate, repositórios universitários
- Foco em laudos que mostrem: área valvar, gradiente médio, velocidade máxima

Fontes úteis encontradas:
- Scribd: https://www.scribd.com/search?query=laudo+ecocardiograma
- Academia.edu
- Repositórios de hospitais universitários (USP, UNIFESP, etc)
```

### Sites encontrados anteriormente:
- https://www.scribd.com/document/663941190/Laudo-Ecocardiograma-2807
- https://www.scribd.com/document/556162593/Modelo-de-Laudo-Eco-Celia-Camara

## 📚 Referências Técnicas

- [Anthropic API Docs](https://docs.anthropic.com/)
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React + TypeScript](https://react-typescript-cheatsheet.netlify.app/)
- [Diretrizes ACC/AHA - Estenose Aórtica](https://www.ahajournals.org/)

## 🤝 Contribuindo

Este é um projeto em desenvolvimento ativo. Contribuições são bem-vindas!

## 📝 Licença

[Definir licença apropriada]

## 👨‍💻 Autor

Desenvolvido para modernizar a triagem de pacientes com estenose aórtica e aumentar o acesso ao procedimento TAVI.

---

**Status:** ✅ MVP Funcional  
**Última atualização:** Janeiro 2026
