# CardioScreen - Prompt para Windsurf IDE

## 📋 Contexto do Projeto

Você está desenvolvendo o **CardioScreen**, um sistema de triagem automatizada para estenose aórtica usando Inteligência Artificial. O sistema analisa laudos de ecocardiograma em PDF e identifica automaticamente pacientes que podem necessitar de procedimento TAVI (Transcatheter Aortic Valve Implantation).

## 🎯 Problema que Resolve

Muitos pacientes realizam ecocardiogramas que detectam estenose aórtica importante, mas essa informação crítica não é identificada ou encaminhada adequadamente. O CardioScreen automatiza a triagem desses laudos, criando uma fila priorizada para revisão médica.

## 🏗️ Arquitetura Atual

### Stack Tecnológico
- **Backend**: FastAPI + Python 3.11
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **IA**: Claude Haiku 4.5 (Anthropic API)
- **Banco de dados**: SQLite (dev) / PostgreSQL (prod)
- **Infraestrutura**: Docker + Docker Compose

### Estrutura de Arquivos

```
cardioscreen/
├── backend/
│   ├── main.py                 # API FastAPI principal
│   ├── database.py            # SQLAlchemy ORM
│   ├── models/
│   │   └── schemas.py         # Pydantic models
│   ├── services/
│   │   ├── pdf_processor.py   # Extração de texto de PDFs
│   │   └── llm_analyzer.py    # Análise com Claude Haiku
│   ├── requirements.txt
│   ├── .env.example
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Componente principal
│   │   ├── components/
│   │   │   ├── FileUpload.tsx       # Upload drag-and-drop
│   │   │   ├── LaudoCard.tsx        # Card de resultado
│   │   │   └── TriagemDashboard.tsx # Dashboard principal
│   │   └── services/
│   │       └── api.ts         # Cliente API
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## 🔑 Funcionalidades Implementadas

### ✅ Backend (FastAPI)

1. **Endpoints da API**:
   - `POST /api/analisar-laudo` - Analisa um único laudo
   - `POST /api/processar-lote` - Processa múltiplos laudos
   - `GET /api/laudos` - Lista laudos com filtros
   - `PATCH /api/laudos/{id}/revisar` - Marca como revisado
   - `GET /api/estatisticas` - Estatísticas do sistema

2. **Processamento de PDF**:
   - Extração de texto com PyPDF2
   - Validação de arquivos PDF
   - Extração de metadados (nome, idade, data do exame)

3. **Análise por IA**:
   - Uso de Claude Haiku 4.5 (modelo econômico)
   - Prompt estruturado para extração de dados clínicos
   - Classificação de gravidade e prioridade
   - Output em JSON estruturado

4. **Banco de Dados**:
   - SQLAlchemy ORM
   - Modelo `LaudoDB` para persistência
   - Suporte a SQLite (dev) e PostgreSQL (prod)

### ✅ Frontend (React + TypeScript)

1. **Componentes**:
   - `FileUpload`: Upload drag-and-drop de PDFs
   - `LaudoCard`: Visualização de resultado individual
   - `TriagemDashboard`: Dashboard com estatísticas e filtros
   - `App`: Navegação entre Upload e Dashboard

2. **Features UX**:
   - Interface responsiva com Tailwind CSS
   - Cores por prioridade (vermelho/amarelo/verde)
   - Filtros por prioridade e status de revisão
   - Visualização de laudo completo expansível
   - Sistema de revisão médica com observações

3. **Integração API**:
   - Cliente Axios configurado
   - Tratamento de erros
   - Feedback visual de processamento
   - Upload de múltiplos arquivos

## 🧠 Lógica de Triagem (Critérios Clínicos)

A IA classifica estenose aórtica baseada em guidelines médicos:

### Gravidade
- **Ausente**: Sem estenose ou gradientes normais
- **Leve**: Área valvar >1.5cm² OU gradiente <25mmHg
- **Moderada**: Área 1.0-1.5cm² OU gradiente 25-40mmHg
- **Importante/Grave**: Área <1.0cm² OU gradiente >40mmHg OU velocidade >4.0m/s

### Prioridade para TAVI
- **ALTA**: Estenose importante/grave (área <1.0 OU gradiente >40)
- **MÉDIA**: Estenose moderada (área 1.0-1.5 OU gradiente 25-40)
- **BAIXA**: Estenose leve/ausente OU dados insuficientes

## 🚀 Como Continuar Desenvolvendo

### Setup no Windsurf

1. **Abra o projeto**:
   ```bash
   cd cardioscreen
   code .  # ou abra no Windsurf
   ```

2. **Configure variáveis de ambiente**:
   ```bash
   # Backend - crie backend/.env
   ANTHROPIC_API_KEY=sua_chave_aqui
   DATABASE_URL=sqlite:///./cardioscreen.db
   ```

3. **Instale dependências**:
   ```bash
   # Backend
   cd backend
   pip install -r requirements.txt
   
   # Frontend
   cd frontend
   npm install
   ```

4. **Rode em modo dev**:
   ```bash
   # Terminal 1 - Backend
   cd backend
   uvicorn main:app --reload
   
   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

## 📝 Próximas Tarefas Sugeridas

### 🔴 Prioridade Alta

1. **Adicionar testes**:
   - Backend: pytest para endpoints da API
   - Frontend: Vitest/React Testing Library
   - Testes com laudos reais anonimizados

2. **Melhorar extração de dados**:
   - OCR para PDFs escaneados (Tesseract)
   - Regex mais robusto para metadados
   - Normalização de unidades (cm²/mmHg)

3. **Sistema de autenticação**:
   - Login de usuários médicos
   - Controle de acesso por role
   - Registro de ações (audit log)

### 🟡 Prioridade Média

4. **Dashboard avançado**:
   - Gráficos com Recharts
   - Métricas de performance da IA
   - Exportação de relatórios

5. **Notificações**:
   - Email para casos de alta prioridade
   - Integração com Slack/Teams
   - Webhooks para sistemas externos

6. **Melhorias de UX**:
   - Paginação na lista de laudos
   - Busca por nome de paciente
   - Ordenação personalizada

### 🟢 Futuro

7. **Fine-tuning do modelo**:
   - Coletar dataset de laudos anotados
   - Fine-tune do Claude (ou usar Llama local)
   - A/B testing de prompts

8. **Integração hospitalar**:
   - API para PACS/RIS
   - HL7 FHIR para interoperabilidade
   - Exportação DICOM SR

9. **Deploy e infraestrutura**:
   - CI/CD com GitHub Actions
   - Deploy em cloud (AWS/GCP/Azure)
   - Monitoramento com Sentry
   - Backup automático do banco

## 💡 Dicas de Desenvolvimento

### Para o Backend (FastAPI)

```python
# Adicionar endpoint para debugging
@app.get("/debug/laudo/{laudo_id}")
async def debug_laudo(laudo_id: int, db: Session = Depends(get_db)):
    """Ver laudo bruto para debugging"""
    laudo = db.query(LaudoDB).filter(LaudoDB.id == laudo_id).first()
    return {
        "texto_extraido": laudo.texto_extraido,
        "analise_llm": laudo.justificativa
    }
```

### Para o Frontend (React)

```typescript
// Adicionar loading states melhores
const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

// Implementar retry automático
const fetchWithRetry = async (fn: () => Promise<any>, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};
```

### Para a IA (Prompt Engineering)

Se a acurácia não estiver boa:

1. **Adicione exemplos no prompt** (few-shot learning):
```python
prompt = f"""
Você é um cardiologista...

EXEMPLO 1:
Laudo: "Estenose aórtica importante, área valvar de 0.7cm²..."
Output: {{"gravidade": "importante", "area_valvar": 0.7, ...}}

EXEMPLO 2:
Laudo: "Válvula aórtica com esclerose leve..."
Output: {{"gravidade": "leve", "area_valvar": null, ...}}

Agora analise este laudo:
{texto_laudo}
"""
```

2. **Ajuste temperatura**:
```python
# Mais determinístico (atual)
temperature=0.1

# Mais variado (se precisar criatividade)
temperature=0.3
```

3. **Use chain-of-thought**:
```python
prompt += """
Antes de responder, raciocine passo a passo:
1. Identifique se há menção de estenose
2. Encontre valores numéricos (área, gradiente)
3. Compare com critérios de gravidade
4. Classifique a prioridade

Então forneça o JSON final.
"""
```

## 🐛 Debugging Comum

### Problema: PDF não processa

```python
# Adicione logs no pdf_processor.py
import logging
logging.basicConfig(level=logging.DEBUG)

def extrair_texto(pdf_bytes: bytes) -> str:
    logging.debug(f"PDF size: {len(pdf_bytes)} bytes")
    # ...resto do código
```

### Problema: IA retorna JSON inválido

```python
# No llm_analyzer.py, melhore o parsing
try:
    dados = json.loads(resposta_limpa)
except json.JSONDecodeError as e:
    logging.error(f"JSON inválido: {resposta_limpa}")
    # Tentar extrair com regex
    # Ou retornar análise conservadora
```

### Problema: Frontend não conecta ao backend

```bash
# Verifique CORS no backend (main.py)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Específico
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## 📊 Métricas de Sucesso

Acompanhe:
- **Acurácia**: % de classificações corretas vs. revisão médica
- **Recall**: % de casos graves detectados
- **Tempo médio**: Processamento por laudo
- **Custo**: Gasto com API Anthropic
- **Uso**: Laudos processados/dia

## 🔐 Segurança e Compliance

Antes de usar em produção:

1. [ ] Implementar autenticação robusta (OAuth2 + JWT)
2. [ ] Criptografar dados sensíveis no banco
3. [ ] Adicionar rate limiting na API
4. [ ] Configurar HTTPS obrigatório
5. [ ] Revisar conformidade LGPD
6. [ ] Implementar backup automático
7. [ ] Adicionar logging de auditoria
8. [ ] Sanitizar inputs (SQL injection, XSS)

## 🎓 Recursos de Referência

### Clínicos
- [Guidelines ACC/AHA para Estenose Aórtica](https://www.ahajournals.org)
- [Critérios TAVI - SBC](https://www.cardiol.br)

### Técnicos
- [Anthropic API Docs](https://docs.anthropic.com)
- [FastAPI Docs](https://fastapi.tiangolo.com)
- [React + TypeScript](https://react-typescript-cheatsheet.netlify.app)

## 💬 Comandos Úteis para o Windsurf

Quando estiver desenvolvendo, você pode pedir ao Windsurf:

```
"Adicione testes unitários para o pdf_processor.py"
"Implemente busca por nome de paciente no frontend"
"Crie um endpoint para exportar laudos em CSV"
"Adicione gráficos de estatísticas no dashboard"
"Melhore o tratamento de erros na análise por IA"
"Implemente paginação na lista de laudos"
```

## ✅ Checklist de Qualidade

Antes de fazer commit:

- [ ] Código formatado (black/prettier)
- [ ] Types corretos (mypy/tsc --noEmit)
- [ ] Testes passando
- [ ] README atualizado
- [ ] Variáveis sensíveis em .env
- [ ] Logs informativos adicionados

---

**Última atualização**: 2026-01-31

**Versão**: 1.0.0

**Status**: MVP funcional, pronto para testes e melhorias

Boa sorte com o desenvolvimento! 🚀❤️
