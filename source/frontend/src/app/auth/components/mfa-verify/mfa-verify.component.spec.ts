import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MfaVerifyComponent } from './mfa-verify.component';

describe('MfaVerifyComponent', () => {
  let component: MfaVerifyComponent;
  let fixture: ComponentFixture<MfaVerifyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MfaVerifyComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(MfaVerifyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
