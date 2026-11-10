import argparse, csv
from pathlib import Path
from .core import Simulator, POLICIES

def main():
    a=argparse.ArgumentParser()
    a.add_argument('--mode', choices=POLICIES, default='nabh')
    a.add_argument('--drones',type=int,default=50)
    a.add_argument('--steps',type=int,default=60)
    a.add_argument('--seed',type=int,default=7)
    a.add_argument('--csv',default='')
    args=a.parse_args()
    sim=Simulator(drones=args.drones,seed=args.seed,mode=args.mode)
    rows=[]
    for _ in range(args.steps):
        sim.step()
        rows.append(sim.metrics())
    if args.csv:
        out=Path(args.csv)
        out.parent.mkdir(parents=True, exist_ok=True)
        with out.open('w',newline='') as f:
            writer=csv.DictWriter(f,fieldnames=rows[0].keys())
            writer.writeheader(); writer.writerows(rows)
    print(rows[-1])
if __name__=='__main__':
    main()
