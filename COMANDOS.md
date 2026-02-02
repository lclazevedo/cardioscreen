# CardioScreen - Comandos Úteis

## Setup Inicial

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env
# Editar .env e adicionar ANTHROPIC_API_KEY
```

### Frontend
```bash
cd frontend
npm install
```

## Desenvolvimento

### Rodar Backend (Terminal 1)
```bash
cd backend
source venv/bin/activate
python app/main.py
# ou: uvicorn app.main:app --reload --port 8000
```

### Rodar Frontend (Terminal 2)
```bash
cd frontend
npm start
```

### Acessar
- Backend API: http://localhost:8000
- Documentação: http://localhost:8000/docs
- Frontend: http://localhost:3000

## Testes

### Testar API
```bash
# Health check
curl http://localhost:8000/

# Análise de texto
curl -X POST http://localhost:8000/analisar-texto \
  -H "Content-Type: application/json" \
  -d '{"texto": "Estenose aórtica importante. Área: 0.7cm². Gradiente: 48mmHg."}'
```

### Converter laudos .txt para .pdf
```bash
cd tests/laudos_exemplo

# Instalar reportlab
pip install reportlab

# Converter
python << EOF
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import os

for txt in os.listdir('.'):
    if txt.endswith('.txt'):
        pdf = txt.replace('.txt', '.pdf')
        c = canvas.Canvas(pdf, pagesize=letter)
        with open(txt, encoding='utf-8') as f:
            y = 750
            for line in f:
                if y < 50:
                    c.showPage()
                    y = 750
                c.drawString(50, y, line.strip())
                y -= 15
        c.save()
        print(f'✓ {pdf}')
EOF
```

## Deploy (Futuro)

### Docker
```bash
# Backend
docker build -t cardioscreen-backend ./backend
docker run -p 8000:8000 --env-file backend/.env cardioscreen-backend

# Frontend
docker build -t cardioscreen-frontend ./frontend
docker run -p 3000:80 cardioscreen-frontend
```

### Heroku
```bash
# Backend
heroku create cardioscreen-api
heroku config:set ANTHROPIC_API_KEY=sk-ant-...
git push heroku main

# Frontend (Vercel/Netlify)
# Fazer deploy via interface web
```

## Manutenção

### Atualizar dependências
```bash
# Backend
pip list --outdated
pip install --upgrade <package>

# Frontend
npm outdated
npm update
```

### Logs
```bash
# Backend
tail -f backend/logs/app.log

# Frontend
# Logs aparecem no terminal do npm start
```

## Troubleshooting

### Erro: ANTHROPIC_API_KEY não encontrada
```bash
# Verificar .env
cat backend/.env
# Deve ter: ANTHROPIC_API_KEY=sk-ant-...

# Recarregar ambiente
cd backend
source venv/bin/activate
python app/main.py
```

### Erro: CORS
```bash
# Verificar se frontend está em localhost:3000
# Verificar app/main.py -> CORSMiddleware
```

### Erro: Módulo não encontrado
```bash
# Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt

# Frontend
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Performance lenta
```bash
# Usar Claude Haiku em vez de Sonnet/Opus
# Já configurado por padrão: claude-haiku-4-5-20251001
```

## Dicas

### Desenvolvimento Windsurf
1. Abra projeto no Windsurf
2. Configure 2 terminais integrados
3. Terminal 1: Backend
4. Terminal 2: Frontend
5. Use Cascade para modificações no código

### Hot Reload
- Backend: `uvicorn app.main:app --reload`
- Frontend: já incluso no `npm start`

### Formato do Código
```bash
# Backend (Black)
pip install black
black backend/app/

# Frontend (Prettier)
npm install -g prettier
prettier --write frontend/src/
```
