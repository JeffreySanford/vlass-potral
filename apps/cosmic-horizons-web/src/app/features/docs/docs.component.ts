import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';

@Component({
  selector: 'app-docs',
  templateUrl: './docs.component.html',
  styleUrls: ['./docs.component.scss'],
  standalone: false
})
export class DocsComponent {
  private route = inject(ActivatedRoute);
  
  docId$ = this.route.params.pipe(map(params => params['docId']));

  docMap: Record<string, string> = {
    'architecture': 'documentation/architecture/TECHNICAL-ARCHITECTURE.md',
    'roadmap': 'documentation/planning/roadmap/ROADMAP.md',
    'spike': 'documentation/architecture/TACC-JOB-ORCHESTRATION-SPIKE.md',
    'frontend': 'documentation/frontend/FRONTEND-OVERVIEW.md',
    'viewer': 'documentation/frontend/VIEWER-CONTROLS.md',
    'components': 'documentation/frontend/COMPONENTS.md',
    'agents': 'AGENTS.md',
    'tacc': 'documentation/architecture/TACC-JOB-ORCHESTRATION-SPIKE.md',
    'cosmic-datasets': 'documentation/reference/COSMIC-DATASETS.md',
    'testing': 'documentation/quality/TESTING-STRATEGY.md',
    'coding-standards': 'documentation/quality/CODING-STANDARDS.md',
    'audit': 'documentation/adr/ADR-001-AUDIT-RETENTION-TWO-TIER.md'
  };

  sections = [
    {
      title: 'Project Overview',
      icon: 'info',
      links: [
        { label: 'Technical Architecture', path: '/docs/architecture' },
        { label: 'Product Roadmap', path: '/docs/roadmap' },
        { label: 'Phase 4 Spike Details', path: '/docs/spike' }
      ]
    },
    {
      title: 'Frontend & UI',
      icon: 'web',
      links: [
        { label: 'Angular 18 Standard', path: '/docs/frontend' },
        { label: 'Viewer Implementation', path: '/docs/viewer' },
        { label: 'Component Library', path: '/docs/components' }
      ]
    },
    {
      title: 'Science & Data',
      icon: 'science',
      links: [
        { label: 'CosmicAI Integration', path: '/docs/agents' },
        { label: 'TACC Orchestration', path: '/docs/tacc' },
        { label: 'Cosmic Datasets', path: '/docs/cosmic-datasets' }
      ]
    },
    {
      title: 'Quality & Standards',
      icon: 'verified',
      links: [
        { label: 'Testing Strategy', path: '/docs/testing' },
        { label: 'Coding Standards', path: '/docs/coding-standards' },
        { label: 'Audit Retention', path: '/docs/audit' }
      ]
    }
  ];
}
