# FutureFarmNow - Next.js Application

A modern web application for agricultural data analysis and visualization, providing farmers and researchers with powerful tools to analyze soil properties, NDVI data, and generate comprehensive reports.

## 🚀 **Quick Start**

### **Prerequisites**

- **Node.js 18.17 or later** - [Download](https://nodejs.org/)
- **npm 9 or later** (comes with Node.js)
- **Git** - [Download](https://git-scm.com/)

### **Local Development Setup**

```bash
# Clone the repository
git clone https://github.com/yourusername/futurefarmnow.git
cd futurefarmnow/ffn-nextjs-app

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your API configuration
vi .env.local
# NEXT_PUBLIC_API_BASE_URL=https://raptor.cs.ucr.edu/futurefarmnow-backend-0.3-RC1
# Optional: For development, you can use a local backend
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.


## 🛠️ **Available Scripts**

### **Development**
```bash
npm run dev          # Start development server (http://localhost:3000)
npm run lint         # Run ESLint for code quality checks
npm run type-check   # Run TypeScript type checking
```

### **Production Build**
```bash
npm run build        # Create optimized production build
npm run start        # Start production server
```

### **Quality Assurance**
```bash
npm run lint         # Check code quality and style
npm run type-check   # Verify TypeScript types
```

## 🏗️ **Build & Deployment**

### **Local Production Build**

```bash
# Create production build
npm run build

# Test production build locally
npm run start
```

## 📁 **Project Structure**

```
ffn-nextjs-app/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/            # API routes (CORS proxies)
│   │   ├── globals.css     # Global styles
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Home page
│   ├── components/         # React components
│   │   ├── common/         # Shared components
│   │   ├── map/           # Map integration
│   │   ├── panels/        # Analysis panels
│   │   ├── ui/            # shadcn/ui components
│   │   └── visualizations/ # Charts and plots
│   └── lib/               # Utilities and configuration
│       ├── api/           # API client
│       ├── stores/        # Zustand state management
│       ├── types/         # TypeScript definitions
│       └── utils/         # Helper functions
├── public/                # Static assets
├── package.json          # Dependencies and scripts
└── next.config.js        # Next.js configuration
```

## 🧰 **Technology Stack**

### **Frontend Framework**
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Component library

### **State Management**
- **Zustand** - Lightweight state management
- **React Query** - Server state management
- **React Context** - Theme management

### **Map & Visualization**
- **Leaflet** - Interactive maps
- **Leaflet Draw** - Polygon drawing tools
- **Recharts** - Data visualization charts
- **html2canvas + jsPDF** - PDF export functionality

### **Development Tools**
- **ESLint** - Code quality
- **TypeScript** - Type checking
- **Prettier** - Code formatting
- **Husky** - Git hooks

## 🌟 **Key Features**

### **Soil Analysis**
- Interactive soil property analysis
- Multiple soil layers (pH, organic matter, clay content, etc.)
- Custom depth range selection
- Statistical analysis with box plots
- PDF report generation with visualizations

### **NDVI Analysis**
- Normalized Difference Vegetation Index tracking
- Time-series visualization
- Year-over-year comparisons
- Export capabilities
- Health status indicators

### **Map Integration**
- Interactive Leaflet maps
- Polygon drawing tools
- Farmland boundary visualization
- Zoom-dependent analysis options
- Real-time data overlay

### **Data Export**
- Comprehensive PDF reports
- Location details and WKT geometry
- Chart and map visualizations
- Statistical summaries

   
## 📄 **License**

Copyright 2025 University of California, Riverside

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

---

**Built with ❤️ for sustainable agriculture**