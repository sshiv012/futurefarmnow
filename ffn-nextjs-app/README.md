# FutureFarmNow - Next.js Application

A comprehensive geospatial data processing and visualization platform that combines California farmland vector data with satellite soil salinity data through an interactive web interface. Built with modern web technologies to provide farmers and researchers with powerful tools for agricultural analysis and decision-making.

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
# NEXT_PUBLIC_API_BASE_URL=https://raptor.cs.ucr.edu
# NEXT_PUBLIC_WSGI_BASE_URL=https://raptor.cs.ucr.edu:8081

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

### **Static File Deployment**

```bash
# Build application as static files
npm run build

# Deploy to server public_html directory
scp -r out/* user@server:/var/www/sites/raptor.cs.ucr.edu/public_html/
```

**Note:** The application is configured for static deployment with Next.js output export. The build process generates an `out/` directory with all static files. Automated deployment includes backup systems and rollback capabilities.

## 📁 **Project Structure**

```
ffn-nextjs-app/
├── src/
│   ├── app/                 # Next.js App Router (static export)
│   │   ├── globals.css     # Global styles with design tokens
│   │   ├── layout.tsx      # Root layout with theme system
│   │   ├── page.tsx        # Main application page
│   │   └── providers.tsx   # Global providers (theme, tutorial)
│   ├── components/         # React components
│   │   ├── common/         # Shared components (HelpModal, Loading)
│   │   ├── map/           # Leaflet map integration
│   │   ├── panels/        # Analysis panels (Soil, NDVI, SamplePoints)
│   │   ├── tutorial/      # Interactive tutorial system
│   │   ├── ui/            # shadcn/ui components
│   │   └── visualizations/ # Charts, plots, and legends
│   ├── hooks/             # Custom React hooks
│   │   └── useURLSync.ts  # URL state synchronization
│   ├── lib/               # Utilities and configuration
│   │   ├── api/           # API client with multiple backend support
│   │   ├── contexts/      # React Context (Theme, Tutorial)
│   │   ├── stores/        # Zustand state management
│   │   ├── tutorial/      # Tutorial step definitions
│   │   ├── types/         # TypeScript interfaces
│   │   └── utils/         # Helper functions and utilities
│   └── MainLayout.tsx     # Main application layout
├── public/                # Static assets (icons, images)
├── out/                   # Static build output
├── package.json          # Dependencies and scripts
├── next.config.js        # Next.js configuration with static export
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
- **Leaflet** - Interactive maps with theme support
- **Leaflet Draw** - Polygon drawing tools
- **Custom SVG Charts** - Box plots and statistical visualizations
- **html2canvas + jsPDF** - Comprehensive PDF export with visual components

### **Development Tools**
- **ESLint** - Code quality
- **TypeScript** - Type checking
- **Prettier** - Code formatting
- **Husky** - Git hooks

## 🌟 **Key Features**

### **Interactive Tutorial System**
- Step-by-step guided tutorials for farmers
- Contextual help with visual overlays
- Progressive disclosure from basic to advanced features
- Completion tracking and resumable sessions

### **Enhanced Soil Analysis**
- Interactive soil property analysis with multiple layers
- Horizontal box plot visualizations with statistical indicators
- Zoom-level dependent analysis (polygon vs farmland view)
- "Analyze All Farmland in View" for high zoom levels
- Custom depth range selection (0-100cm)
- Comprehensive PDF export with visual components

### **Advanced NDVI Analysis**
- Normalized Difference Vegetation Index tracking
- Time-series visualization with custom date ranges
- Year-over-year comparisons and trend analysis
- URL state management for sharing analysis sessions
- Real-time legend and color mapping

### **Smart Map Integration**
- Theme-aware Leaflet maps (light/dark mode)
- Advanced polygon drawing tools with area calculation
- Farmland boundary visualization with blue styling
- Dynamic analysis options based on zoom level
- GPS location services and coordinate display
- Dataset selection with California regions

### **Smart Soil Sampling**
- GPS-optimized sampling point generation for field testing
- Interactive map visualization with numbered sampling locations
- Multiple soil property layer selection (alpha, clay, sand, silt, pH, etc.)
- Customizable sampling density (5, 7, 10, or 12 points)
- Depth range configuration (surface to 2+ feet deep)
- Statistical accuracy assessment for sampling reliability
- CSV export for GPS device navigation
- Real-time sampling accuracy analysis

### **Professional Reports & Export**
- Comprehensive PDF reports with location details
- WKT geometry strings and bounding box coordinates
- Visual component capture (charts, legends, soil images)
- Statistical summaries with key metrics
- Professional formatting with automatic page breaks

### **User Experience**
- Modern responsive design with 8pt grid system
- Dark/light theme with CSS design tokens
- Toast notifications with dismiss functionality
- URL state synchronization for sharing sessions
- Collapsible sidebar with organized analysis tabs
- Error boundaries and loading states

   
## 🏗️ **Architecture Overview**

The system integrates with a hybrid backend architecture:

- **Java/Scala Backend (Port 8890)** - Primary processing engine using Beast/Spark
- **Python WSGI Backend (Port 8081/8082)** - Specialized geospatial operations
- **React Frontend** - Interactive map visualization and analysis

### **API Integration**

Key endpoints:
- `GET /vector/datasets` - Available vector datasets
- `POST /soil/aggregatestats.json` - Soil statistics analysis
- `POST /soil/farmland.json` - Farmland soil analysis by bounding box
- `POST /soil/sample.json` - Smart soil sampling point generation
- `POST /ndvi/timeseries.json` - NDVI time series data
- `POST /vectors/farmland.geojson` - Farmland boundary data

### **Technical Implementation Details**

#### **Soil Sampling Accuracy Calculation**

The soil sampling accuracy assessment uses percentage difference between sample statistics and field-wide statistics:

```javascript
// Calculate percentage difference between sample mean and field-wide mean
const accuracy = Math.abs(stats.sample.mean - stats.actual.mean) / stats.actual.mean * 100

// Accuracy classification thresholds
const accuracyStatus = accuracy < 5 ? 'Excellent' : 
                      accuracy < 10 ? 'Good' : 
                      accuracy < 20 ? 'Fair' : 'Poor'
```

**Accuracy Classifications:**
- **Excellent (< 5%)**: Sample mean within 5% of field-wide mean
- **Good (5-10%)**: Sample mean within 5-10% of field-wide mean  
- **Fair (10-20%)**: Sample mean within 10-20% of field-wide mean
- **Poor (> 20%)**: Sample mean differs by more than 20% from field-wide mean

**Example:** If field-wide average pH is 6.0 and sample average is 6.2:
- Accuracy = |6.2 - 6.0| / 6.0 × 100 = 3.33%
- Classification = "Excellent" (< 5% difference)

This methodology helps farmers understand how representative their soil sampling strategy is for making field-wide management decisions.

#### **Map Marker Implementation**

Soil sampling points are displayed as interactive map markers:

```javascript
// Blue circular markers with white ID numbers
const marker = L.circleMarker([point.y, point.x], {
  radius: 12,
  fillColor: '#3b82f6',
  color: '#1e40af',
  weight: 2,
  opacity: 1,
  fillOpacity: 0.8
})

// Hover tooltips with precise GPS coordinates
marker.bindTooltip(`Sample Point ${point.id}<br/>Lat: ${lat}<br/>Lng: ${lng}`)
```

## 📊 **Data Sources**

- **California Farmland Vector Data** - High-resolution farmland boundaries
- **Satellite Soil Salinity Data** - Multi-depth soil property measurements
- **Landsat 8/9 NDVI Data** - Vegetation index time series
- **Sentinel-2 NDVI Data** - High-resolution vegetation monitoring

## 🚀 **Deployment Options**

### **Production Deployment**

1. **Automated Daily Deployment** - Server-side cron job with GitHub integration
2. **Webhook Deployment** - Immediate deployment on code pushes
3. **Manual Deployment** - Two-stage deployment via bolt.cs.ucr.edu

All deployment methods include:
- Automatic backup and rollback capabilities
- Build verification and dependency management
- Comprehensive logging and monitoring

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